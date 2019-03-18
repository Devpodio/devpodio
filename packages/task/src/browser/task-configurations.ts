/********************************************************************************
 * Copyright (C) 2017-2018 Ericsson and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import { TaskConfiguration } from '../common/task-protocol';
import { Disposable, DisposableCollection } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileSystemWatcher, FileChangeEvent } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { FileChange, FileChangeType } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { FileSystem } from '@theia/filesystem/lib/common';
import * as jsoncparser from 'jsonc-parser';
import { ParseError } from 'jsonc-parser';

export interface TaskConfigurationClient {
    /**
     * The task configuration file has changed, so a client might want to refresh its configurations
     * @returns an array of strings, each one being a task label
     */
    taskConfigurationChanged: (event: string[]) => void;
}

/**
 * Watches a tasks.json configuration file and provides a parsed version of the contained task configurations
 */
@injectable()
export class TaskConfigurations implements Disposable {

    protected readonly toDispose = new DisposableCollection();
    /**
     * Map of source (path of root folder that the task config comes from) and task config map.
     * For the inner map (i.e., task config map), the key is task label and value TaskConfiguration
     */
    protected tasksMap = new Map<string, Map<string, TaskConfiguration>>();
    protected watchedConfigFileUris: string[] = [];
    protected watchersMap = new Map<string, Disposable>(); // map of watchers for task config files, where the key is folder uri

    /** last directory element under which we look for task config */
    protected readonly TASKFILEPATH = '.theia';
    /** task configuration file name */
    protected readonly TASKFILE = 'tasks.json';

    protected client: TaskConfigurationClient | undefined = undefined;

    constructor(
        @inject(FileSystemWatcher) protected readonly watcherServer: FileSystemWatcher,
        @inject(FileSystem) protected readonly fileSystem: FileSystem
    ) {
        this.toDispose.push(watcherServer);
        this.watcherServer.onFilesChanged(async changes => {
            try {
                const watchedConfigFileChanges = changes.filter(change =>
                    this.watchedConfigFileUris.some(fileUri => FileChangeEvent.isAffected([change], new URI(fileUri)))
                ).map(relatedChange => (
                    { uri: relatedChange.uri.toString(), type: relatedChange.type }
                ));
                if (watchedConfigFileChanges.length >= 0) {
                    await this.onDidTaskFileChange(watchedConfigFileChanges);
                    if (this.client) {
                        this.client.taskConfigurationChanged(this.getTaskLabels());
                    }
                }
            } catch (err) {
                console.error(err);
            }
        });

        this.toDispose.push(Disposable.create(() => {
            this.tasksMap.clear();
            this.client = undefined;
        }));
    }

    setClient(client: TaskConfigurationClient) {
        this.client = client;
    }

    dispose() {
        this.toDispose.dispose();
    }

    get configFileUris(): string[] {
        return this.watchedConfigFileUris;
    }

    /**
     * Triggers the watching of a potential task configuration file, under the given root URI.
     * Returns whether a configuration file was found.
     */
    async watchConfigurationFile(rootUri: string): Promise<boolean> {
        const configFileUri = this.getConfigFileUri(rootUri);
        if (!this.watchedConfigFileUris.some(uri => uri === configFileUri)) {
            this.watchedConfigFileUris.push(configFileUri);
            const disposableWatcher = await this.watcherServer.watchFileChanges(new URI(configFileUri));
            const disposable = Disposable.create(() => {
                disposableWatcher.dispose();
                this.watchersMap.delete(configFileUri);
                const ind = this.watchedConfigFileUris.findIndex(uri => uri === configFileUri);
                if (ind >= 0) {
                    this.watchedConfigFileUris.splice(ind, 1);
                }
            });
            this.watchersMap.set(configFileUri, disposable);
            this.toDispose.push(disposable);
            this.refreshTasks(configFileUri);
        }

        if (await this.fileSystem.exists(configFileUri)) {
            return true;
        } else {
            console.info(`Config file ${this.TASKFILE} does not exist under ${rootUri}`);
            return false;
        }
    }

    /**
     * Stops watchers added to a potential task configuration file.
     * Returns whether a configuration file was being watched before this function gets called.
     */
    unwatchConfigurationFile(configFileUri: string): boolean {
        if (!this.watchersMap.has(configFileUri)) {
            return false;
        }
        this.watchersMap.get(configFileUri)!.dispose();
        return true;
    }

    /** returns the list of known task labels */
    getTaskLabels(): string[] {
        return Array.from(this.tasksMap.values()).reduce((acc, labelConfigMap) => acc.concat(Array.from(labelConfigMap.keys())), [] as string[]);
    }

    /** returns the list of known tasks */
    getTasks(): TaskConfiguration[] {
        return Array.from(this.tasksMap.values()).reduce((acc, labelConfigMap) => acc.concat(Array.from(labelConfigMap.values())), [] as TaskConfiguration[]);
    }

    /** returns the task configuration for a given label or undefined if none */
    getTask(source: string, taskLabel: string): TaskConfiguration | undefined {
        const labelConfigMap = this.tasksMap.get(source);
        if (labelConfigMap) {
            return labelConfigMap.get(taskLabel);
        }
    }

    /** removes tasks configured in the given task config file */
    removeTasks(configFileUri: string) {
        const source = this.getSourceFolderFromConfigUri(configFileUri);
        this.tasksMap.delete(source);
    }

    /** returns the string uri of where the config file would be, if it existed under a given root directory */
    protected getConfigFileUri(rootDir: string): string {
        return new URI(rootDir).resolve(this.TASKFILEPATH).resolve(this.TASKFILE).toString();
    }

    /**
     * Called when a change, to a config file we watch, is detected.
     * Triggers a reparse, if appropriate.
     */
    protected async onDidTaskFileChange(fileChanges: FileChange[]): Promise<void> {
        for (const change of fileChanges) {
            if (change.type === FileChangeType.DELETED) {
                this.removeTasks(change.uri);
            } else {
                // re-parse the config file
                await this.refreshTasks(change.uri);
            }
        }
    }

    /**
     * Tries to read the tasks from a config file and if it successes then updates the list of available tasks.
     * If reading a config file wasn't successful then does nothing.
     */
    protected async refreshTasks(configFileUri: string) {
        const tasksConfigsArray = await this.readTasks(configFileUri);
        if (tasksConfigsArray) {
            // only clear tasks map when successful at parsing the config file
            // this way we avoid clearing and re-filling it multiple times if the
            // user is editing the file in the auto-save mode, having momentarily
            // non-parsing JSON.
            this.removeTasks(configFileUri);

            if (tasksConfigsArray.length > 0) {
                const newTaskMap = new Map<string, TaskConfiguration>();
                for (const task of tasksConfigsArray) {
                    newTaskMap.set(task.label, task);
                }
                const source = this.getSourceFolderFromConfigUri(configFileUri);
                this.tasksMap.set(source, newTaskMap);
            }
        }
    }

    /** parses a config file and extracts the tasks launch configurations */
    protected async readTasks(uri: string): Promise<TaskConfiguration[] | undefined> {
        if (!await this.fileSystem.exists(uri)) {
            return undefined;
        } else {
            try {
                const response = await this.fileSystem.resolveContent(uri);

                const strippedContent = jsoncparser.stripComments(response.content);
                const errors: ParseError[] = [];
                const tasks = jsoncparser.parse(strippedContent, errors);

                if (errors.length) {
                    for (const e of errors) {
                        console.error(`Error parsing ${uri}: error: ${e.error}, length:  ${e.length}, offset:  ${e.offset}`);
                    }
                } else {
                    return this.filterDuplicates(tasks['tasks']).map(t => Object.assign(t, { _source: this.getSourceFolderFromConfigUri(uri) }));
                }
            } catch (err) {
                console.error(`Error(s) reading config file: ${uri}`);
            }
        }
    }

    protected filterDuplicates(tasks: TaskConfiguration[]): TaskConfiguration[] {
        const filteredTasks: TaskConfiguration[] = [];
        for (const task of tasks) {
            if (filteredTasks.some(t => t.label === task.label)) {
                // TODO: create a problem marker so that this issue will be visible in the editor?
                console.error(`Error parsing ${this.TASKFILE}: found duplicate entry for label: ${task.label}`);
            } else {
                filteredTasks.push(task);
            }
        }
        return filteredTasks;
    }

    private getSourceFolderFromConfigUri(configFileUri: string): string {
        return new URI(configFileUri).parent.parent.path.toString();
    }
}

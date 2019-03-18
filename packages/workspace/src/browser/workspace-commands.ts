/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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
import URI from '@theia/core/lib/common/uri';
import { SelectionService } from '@theia/core/lib/common/selection-service';
import { Command, CommandContribution, CommandRegistry } from '@theia/core/lib/common/command';
import { MenuContribution, MenuModelRegistry } from '@theia/core/lib/common/menu';
import { CommonMenus } from '@theia/core/lib/browser/common-frontend-contribution';
import { FileSystem, FileStat } from '@theia/filesystem/lib/common/filesystem';
import { FileDialogService } from '@theia/filesystem/lib/browser';
import { SingleTextInputDialog, ConfirmDialog } from '@theia/core/lib/browser/dialogs';
import { OpenerService, OpenHandler, open, FrontendApplication } from '@theia/core/lib/browser';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import { UriCommandHandler, UriAwareCommandHandler } from '@theia/core/lib/common/uri-command-handler';
import { WorkspaceService } from './workspace-service';
import { MessageService } from '@devpodio/core/lib/common/message-service';
import { WorkspacePreferences } from './workspace-preferences';
import { WorkspaceDeleteHandler } from './workspace-delete-handler';
import { WorkspaceDuplicateHandler } from './workspace-duplicate-handler';
import { FileSystemUtils } from '@theia/filesystem/lib/common';
import { WorkspaceCompareHandler } from './workspace-compare-handler';

const validFilename: (arg: string) => boolean = require('valid-filename');

export namespace WorkspaceCommands {

    const WORKSPACE_CATEGORY = 'Workspace';
    const FILE_CATEGORY = 'File';

    // On Linux and Windows, both files and folders cannot be opened at the same time in electron.
    // `OPEN_FILE` and `OPEN_FOLDER` must be available only on Linux and Windows in electron.
    // `OPEN` must *not* be available on Windows and Linux in electron.
    // VS Code does the same. See: https://github.com/theia-ide/theia/pull/3202#issuecomment-430585357
    export const OPEN: Command & { dialogLabel: string } = {
        id: 'workspace:open',
        category: FILE_CATEGORY,
        label: 'Open...',
        dialogLabel: 'Open'
    };
    // No `label`. Otherwise, it shows up in the `Command Palette`.
    export const OPEN_FILE: Command & { dialogLabel: string } = {
        id: 'workspace:openFile',
        category: FILE_CATEGORY,
        dialogLabel: 'Open File'
    };
    export const OPEN_FOLDER: Command & { dialogLabel: string } = {
        id: 'workspace:openFolder',
        dialogLabel: 'Open Folder' // No `label`. Otherwise, it shows up in the `Command Palette`.
    };
    export const OPEN_WORKSPACE: Command & { dialogLabel: string } = {
        id: 'workspace:openWorkspace',
        category: FILE_CATEGORY,
        label: 'Open Workspace...',
        dialogLabel: 'Open Workspace'
    };
    export const OPEN_RECENT_WORKSPACE: Command = {
        id: 'workspace:openRecent',
        category: FILE_CATEGORY,
        label: 'Open Recent Workspace...'
    };
    export const CLOSE: Command = {
        id: 'workspace:close',
        category: WORKSPACE_CATEGORY,
        label: 'Close Workspace'
    };
    export const NEW_FILE: Command = {
        id: 'file.newFile',
        category: FILE_CATEGORY,
        label: 'New File'
    };
    export const NEW_FOLDER: Command = {
        id: 'file.newFolder',
        category: FILE_CATEGORY,
        label: 'New Folder'
    };
    export const FILE_OPEN_WITH = (opener: OpenHandler): Command => ({
        id: `file.openWith.${opener.id}`
    });
    export const FILE_RENAME: Command = {
        id: 'file.rename',
        category: FILE_CATEGORY,
        label: 'Rename'
    };
    export const FILE_DELETE: Command = {
        id: 'file.delete',
        category: FILE_CATEGORY,
        label: 'Delete'
    };
    export const FILE_DUPLICATE: Command = {
        id: 'file.duplicate',
        category: FILE_CATEGORY,
        label: 'Duplicate'
    };
    export const FILE_COMPARE: Command = {
        id: 'file.compare',
        category: FILE_CATEGORY,
        label: 'Compare with Each Other'
    };
    export const ADD_FOLDER: Command = {
        id: 'workspace:addFolder',
        category: WORKSPACE_CATEGORY,
        label: 'Add Folder to Workspace...'
    };
    export const REMOVE_FOLDER: Command = {
        id: 'workspace:removeFolder',
        category: WORKSPACE_CATEGORY,
        label: 'Remove Folder from Workspace'
    };
    export const SAVE_WORKSPACE_AS: Command = {
        id: 'workspace:saveAs',
        category: WORKSPACE_CATEGORY,
        label: 'Save Workspace As...'
    };
}

@injectable()
export class FileMenuContribution implements MenuContribution {

    registerMenus(registry: MenuModelRegistry) {
        registry.registerMenuAction(CommonMenus.FILE_NEW, {
            commandId: WorkspaceCommands.NEW_FILE.id
        });
        registry.registerMenuAction(CommonMenus.FILE_NEW, {
            commandId: WorkspaceCommands.NEW_FOLDER.id
        });
    }

}

@injectable()
export class WorkspaceCommandContribution implements CommandContribution {

    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(SelectionService) protected readonly selectionService: SelectionService;
    @inject(OpenerService) protected readonly openerService: OpenerService;
    @inject(FrontendApplication) protected readonly app: FrontendApplication;
    @inject(MessageService) protected readonly messageService: MessageService;
    @inject(WorkspacePreferences) protected readonly preferences: WorkspacePreferences;
    @inject(FileDialogService) protected readonly fileDialogService: FileDialogService;
    @inject(WorkspaceDeleteHandler) protected readonly deleteHandler: WorkspaceDeleteHandler;
    @inject(WorkspaceDuplicateHandler) protected readonly duplicateHandler: WorkspaceDuplicateHandler;
    @inject(WorkspaceCompareHandler) protected readonly compareHandler: WorkspaceCompareHandler;

    registerCommands(registry: CommandRegistry): void {
        this.openerService.getOpeners().then(openers => {
            for (const opener of openers) {
                const openWithCommand = WorkspaceCommands.FILE_OPEN_WITH(opener);
                registry.registerCommand(openWithCommand, this.newUriAwareCommandHandler({
                    execute: uri => opener.open(uri),
                    isEnabled: uri => opener.canHandle(uri) > 0,
                    isVisible: uri => opener.canHandle(uri) > 0 && this.areMultipleOpenHandlersPresent(openers, uri)
                }));
            }
        });
        registry.registerCommand(WorkspaceCommands.NEW_FILE, this.newWorkspaceRootUriAwareCommandHandler({
            execute: uri => this.getDirectory(uri).then(parent => {
                if (parent) {
                    const parentUri = new URI(parent.uri);
                    const { fileName, fileExtension } = this.getDefaultFileConfig();
                    const vacantChildUri = FileSystemUtils.generateUniqueResourceURI(parentUri, parent, fileName, fileExtension);
                    const dialog = new SingleTextInputDialog({
                        title: 'New File',
                        initialValue: vacantChildUri.path.base,
                        validate: name => this.validateFileName(name, parent)
                    });
                    dialog.open().then(name => {
                        if (name) {
                            const fileUri = parentUri.resolve(name);
                            this.fileSystem.createFile(fileUri.toString()).then(() => {
                                open(this.openerService, fileUri);
                            });
                        }
                    });
                }
            })
        }));
        registry.registerCommand(WorkspaceCommands.NEW_FOLDER, this.newWorkspaceRootUriAwareCommandHandler({
            execute: uri => this.getDirectory(uri).then(parent => {
                if (parent) {
                    const parentUri = new URI(parent.uri);
                    const vacantChildUri = FileSystemUtils.generateUniqueResourceURI(parentUri, parent, 'Untitled');
                    const dialog = new SingleTextInputDialog({
                        title: 'New Folder',
                        initialValue: vacantChildUri.path.base,
                        validate: name => this.validateFileName(name, parent)
                    });
                    dialog.open().then(name => {
                        if (name) {
                            this.fileSystem.createFolder(parentUri.resolve(name).toString());
                        }
                    });
                }
            })
        }));
        registry.registerCommand(WorkspaceCommands.FILE_RENAME, this.newMultiUriAwareCommandHandler({
            isEnabled: uris => uris.some(uri => !this.isWorkspaceRoot(uri)) && uris.length === 1,
            isVisible: uris => uris.some(uri => !this.isWorkspaceRoot(uri)) && uris.length === 1,
            execute: uris => uris.forEach(uri => {
                this.getParent(uri).then(async parent => {
                    if (parent) {
                        const initialValue = uri.path.base;
                        const stat = await this.fileSystem.getFileStat(uri.toString());
                        if (stat === undefined) {
                            throw new Error(`Unexpected error occurred when renaming. File does not exist. URI: ${uri.toString(true)}.`);
                        }
                        const fileType = stat.isDirectory ? 'Directory' : 'File';
                        const titleStr = `Rename ${fileType}`;
                        const dialog = new SingleTextInputDialog({
                            title: titleStr,
                            initialValue,
                            initialSelectionRange: {
                                start: 0,
                                end: uri.path.name.length
                            },
                            validate: (name, mode) => {
                                if (initialValue === name && mode === 'preview') {
                                    return false;
                                }
                                return this.validateFileName(name, parent);
                            }
                        });
                        dialog.open().then(name => {
                            if (name) {
                                this.fileSystem.move(uri.toString(), uri.parent.resolve(name).toString());
                            }
                        });
                    }
                });
            })
        }));
        registry.registerCommand(WorkspaceCommands.FILE_DUPLICATE, this.newMultiUriAwareCommandHandler(this.duplicateHandler));
        registry.registerCommand(WorkspaceCommands.FILE_DELETE, this.newMultiUriAwareCommandHandler(this.deleteHandler));
        registry.registerCommand(WorkspaceCommands.FILE_COMPARE, this.newMultiUriAwareCommandHandler(this.compareHandler));
        this.preferences.ready.then(() => {
            registry.registerCommand(WorkspaceCommands.ADD_FOLDER, this.newMultiUriAwareCommandHandler({
                isEnabled: () => this.workspaceService.isMultiRootWorkspaceOpened,
                isVisible: uris => !uris.length || this.areWorkspaceRoots(uris),
                execute: async uris => {
                    const uri = await this.fileDialogService.showOpenDialog({
                        title: WorkspaceCommands.ADD_FOLDER.label!,
                        canSelectFiles: false,
                        canSelectFolders: true
                    });
                    if (!uri) {
                        return;
                    }
                    const workspaceSavedBeforeAdding = this.workspaceService.saved;
                    await this.addFolderToWorkspace(uri);
                    if (!workspaceSavedBeforeAdding) {
                        const saveCommand = registry.getCommand(WorkspaceCommands.SAVE_WORKSPACE_AS.id);
                        if (saveCommand && await new ConfirmDialog({
                            title: 'Folder added to Workspace',
                            msg: 'A workspace with multiple roots was created. Do you want to save your workspace configuration as a file?',
                            ok: 'Yes',
                            cancel: 'No'
                        }).open()) {
                            registry.executeCommand(saveCommand.id);
                        }
                    }
                }
            }));
            registry.registerCommand(WorkspaceCommands.REMOVE_FOLDER, this.newMultiUriAwareCommandHandler({
                execute: uris => this.removeFolderFromWorkspace(uris),
                isEnabled: () => this.workspaceService.isMultiRootWorkspaceOpened,
                isVisible: uris => this.areWorkspaceRoots(uris) && this.workspaceService.saved
            }));
        });
    }

    protected newUriAwareCommandHandler(handler: UriCommandHandler<URI>): UriAwareCommandHandler<URI> {
        return new UriAwareCommandHandler(this.selectionService, handler);
    }

    protected newMultiUriAwareCommandHandler(handler: UriCommandHandler<URI[]>): UriAwareCommandHandler<URI[]> {
        return new UriAwareCommandHandler(this.selectionService, handler, { multi: true });
    }

    protected newWorkspaceRootUriAwareCommandHandler(handler: UriCommandHandler<URI>): WorkspaceRootUriAwareCommandHandler {
        return new WorkspaceRootUriAwareCommandHandler(this.workspaceService, this.selectionService, handler);
    }

    /**
     * Returns an error message if the file name is invalid. Otherwise, an empty string.
     *
     * @param name the simple file name of the file to validate.
     * @param parent the parent directory's file stat.
     */
    protected validateFileName(name: string, parent: FileStat): string {
        if (!validFilename(name)) {
            return 'Invalid name, try other';
        }
        if (parent.children) {
            for (const child of parent.children) {
                if (new URI(child.uri).path.base === name) {
                    return 'A file with this name already exists.';
                }
            }
        }
        return '';
    }

    protected async getDirectory(candidate: URI): Promise<FileStat | undefined> {
        const stat = await this.fileSystem.getFileStat(candidate.toString());
        if (stat && stat.isDirectory) {
            return stat;
        }
        return this.getParent(candidate);
    }

    protected getParent(candidate: URI): Promise<FileStat | undefined> {
        return this.fileSystem.getFileStat(candidate.parent.toString());
    }

    protected async addFolderToWorkspace(uri: URI | undefined): Promise<void> {
        if (uri) {
            const stat = await this.fileSystem.getFileStat(uri.toString());
            if (stat && stat.isDirectory) {
                await this.workspaceService.addRoot(uri);
            }
        }
    }

    protected areWorkspaceRoots(uris: URI[]): boolean {
        if (!uris.length) {
            return false;
        }
        const rootUris = new Set(this.workspaceService.tryGetRoots().map(root => root.uri));
        return uris.every(uri => rootUris.has(uri.toString()));
    }

    protected isWorkspaceRoot(uri: URI): boolean {
        const rootUris = new Set(this.workspaceService.tryGetRoots().map(root => root.uri));
        return rootUris.has(uri.toString());
    }

    protected getDefaultFileConfig(): { fileName: string, fileExtension: string } {
        const { newFileExtension, newFileName } = FrontendApplicationConfigProvider.get();
        return {
            fileName: newFileName ? newFileName : 'Untitled',
            fileExtension: newFileExtension ? newFileExtension : '.txt'
        };
    }

    protected async removeFolderFromWorkspace(uris: URI[]): Promise<void> {
        const roots = new Set(this.workspaceService.tryGetRoots().map(r => r.uri));
        const toRemove = uris.filter(u => roots.has(u.toString()));
        if (toRemove.length > 0) {
            const messageContainer = document.createElement('div');
            messageContainer.textContent = 'Remove the following folders from workspace? (note: nothing will be erased from disk)';
            const list = document.createElement('ul');
            list.style.listStyleType = 'none';
            toRemove.forEach(u => {
                const listItem = document.createElement('li');
                listItem.textContent = u.displayName;
                list.appendChild(listItem);
            });
            messageContainer.appendChild(list);
            const dialog = new ConfirmDialog({
                title: 'Remove Folder from Workspace',
                msg: messageContainer
            });
            if (await dialog.open()) {
                await this.workspaceService.removeRoots(toRemove);
            }
        }
    }

    protected areMultipleOpenHandlersPresent(openers: OpenHandler[], uri: URI): boolean {
        let count = 0;
        for (const opener of openers) {
            if (opener.canHandle(uri) > 0) {
                count++;
            }
            if (count > 1) {
                return true;
            }
        }
        return false;
    }

}

export class WorkspaceRootUriAwareCommandHandler extends UriAwareCommandHandler<URI> {

    constructor(
        protected readonly workspaceService: WorkspaceService,
        protected readonly selectionService: SelectionService,
        protected readonly handler: UriCommandHandler<URI>
    ) {
        super(selectionService, handler);
    }

    protected getUri(): URI | undefined {
        const uri = super.getUri();
        if (this.workspaceService.isMultiRootWorkspaceOpened) {
            return uri;
        }
        if (uri) {
            return uri;
        }
        const root = this.workspaceService.tryGetRoots()[0];
        return root && new URI(root.uri);
    }

}

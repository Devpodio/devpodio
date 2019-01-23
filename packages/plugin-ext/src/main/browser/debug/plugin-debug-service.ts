/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { DebugService, DebuggerDescription, DebugPath } from '@devpodio/debug/lib/common/debug-service';
import { Disposable, DisposableCollection } from '@devpodio/core/lib/common/disposable';
import { DebugConfiguration } from '@devpodio/debug/lib/common/debug-configuration';
import { IJSONSchema, IJSONSchemaSnippet } from '@devpodio/core/lib/common/json-schema';
import { PluginDebugAdapterContribution } from './plugin-debug-adapter-contribution';
import { injectable, inject, postConstruct } from 'inversify';
import { WebSocketConnectionProvider } from '@devpodio/core/lib/browser/messaging/ws-connection-provider';
import { WorkspaceService } from '@devpodio/workspace/lib/browser';

/**
 * Debug adapter contribution registrator.
 */
export interface PluginDebugAdapterContributionRegistrator {
    /**
     * Registers [PluginDebugAdapterContribution](#PluginDebugAdapterContribution).
     * @param contrib contribution
     */
    registerDebugAdapterContribution(contrib: PluginDebugAdapterContribution): Disposable;

    /**
     * Unregisters [PluginDebugAdapterContribution](#PluginDebugAdapterContribution).
     * @param debugType the debug type
     */
    unregisterDebugAdapterContribution(debugType: string): void;
}

/**
 * Debug service to work with plugin and extension contributions.
 */
@injectable()
export class PluginDebugService implements DebugService, PluginDebugAdapterContributionRegistrator {
    protected readonly contributors = new Map<string, PluginDebugAdapterContribution>();
    protected readonly toDispose = new DisposableCollection();

    // maps session and contribution
    protected readonly sessionId2contrib = new Map<string, PluginDebugAdapterContribution>();
    protected delegated: DebugService;

    @inject(WebSocketConnectionProvider)
    protected readonly connectionProvider: WebSocketConnectionProvider;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @postConstruct()
    protected init(): void {
        this.delegated = this.connectionProvider.createProxy<DebugService>(DebugPath);
        this.toDispose.pushAll([
            Disposable.create(() => this.delegated.dispose()),
            Disposable.create(() => {
                for (const sessionId of this.sessionId2contrib.keys()) {
                    const contrib = this.sessionId2contrib.get(sessionId)!;
                    contrib.terminateDebugSession(sessionId);
                }
                this.sessionId2contrib.clear();
            })]);
    }

    registerDebugAdapterContribution(contrib: PluginDebugAdapterContribution): Disposable {
        const { type } = contrib;

        if (this.contributors.has(type)) {
            console.warn(`Debugger with type '${type}' already registered.`);
            return Disposable.NULL;
        }

        this.contributors.set(type, contrib);
        return Disposable.create(() => this.unregisterDebugAdapterContribution(type));
    }

    unregisterDebugAdapterContribution(debugType: string): void {
        this.contributors.delete(debugType);
    }

    async debugTypes(): Promise<string[]> {
        const debugTypes = await this.delegated.debugTypes();
        return debugTypes.concat(Array.from(this.contributors.keys()));
    }

    async provideDebugConfigurations(debugType: string, workspaceFolderUri: string | undefined): Promise<DebugConfiguration[]> {
        const contributor = this.contributors.get(debugType);
        if (contributor) {
            return contributor.provideDebugConfigurations && contributor.provideDebugConfigurations(workspaceFolderUri) || [];
        } else {
            return this.delegated.provideDebugConfigurations(debugType, workspaceFolderUri);
        }
    }

    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<DebugConfiguration> {
        let resolved = config;

        const contributor = this.contributors.get(config.type);
        if (contributor && contributor.resolveDebugConfiguration) {
            resolved = await contributor.resolveDebugConfiguration(resolved, workspaceFolderUri) || resolved;
        }

        return this.delegated.resolveDebugConfiguration(resolved, workspaceFolderUri);
    }

    async getDebuggersForLanguage(language: string): Promise<DebuggerDescription[]> {
        const debuggers = await this.delegated.getDebuggersForLanguage(language);

        for (const contributor of this.contributors.values()) {
            const languages = await contributor.languages;
            if (languages && languages.indexOf(language) !== -1) {
                const { type } = contributor;
                debuggers.push({ type, label: await contributor.label || type });
            }
        }

        return debuggers;
    }

    async getSchemaAttributes(debugType: string): Promise<IJSONSchema[]> {
        const contributor = this.contributors.get(debugType);
        if (contributor) {
            return contributor.getSchemaAttributes && contributor.getSchemaAttributes() || [];
        } else {
            return this.delegated.getSchemaAttributes(debugType);
        }
    }

    async getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]> {
        let snippets = await this.delegated.getConfigurationSnippets();

        for (const contributor of this.contributors.values()) {
            if (contributor.getConfigurationSnippets) {
                snippets = snippets.concat(await contributor.getConfigurationSnippets());
            }
        }

        return snippets;
    }

    async createDebugSession(config: DebugConfiguration): Promise<string> {
        const contributor = this.contributors.get(config.type);
        if (contributor) {
            const sessionId = await contributor.createDebugSession(config);
            this.sessionId2contrib.set(sessionId, contributor);
            return sessionId;
        } else {
            return this.delegated.createDebugSession(config);
        }
    }

    async terminateDebugSession(sessionId: string): Promise<void> {
        const contributor = this.sessionId2contrib.get(sessionId);
        if (contributor) {
            this.sessionId2contrib.delete(sessionId);
            return contributor.terminateDebugSession(sessionId);
        } else {
            return this.delegated.terminateDebugSession(sessionId);
        }
    }

    dispose(): void {
        this.toDispose.dispose();
    }
}

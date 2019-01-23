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

import { interfaces } from 'inversify';
import {
    LanguagesContributionMain, MAIN_RPC_CONTEXT
} from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import * as theia from '@devpodio/plugin';
import { Workspace, Languages, MessageReader, MessageWriter } from '@devpodio/languages/lib/browser/language-client-services';
import { LanguageClientFactory, BaseLanguageClientContribution } from '@devpodio/languages/lib/browser';
import { MessageService, CommandRegistry } from '@devpodio/core';
import { WorkspaceService } from '@devpodio/workspace/lib/browser';
import { DisposableCollection, Disposable } from '@devpodio/core';
import { WebSocketConnectionProvider } from '@devpodio/core/lib/browser';
import { createMessageConnection, MessageConnection } from 'vscode-jsonrpc';
import { ConnectionMainImpl } from './connection-main';
import { Deferred } from '@devpodio/core/lib/common/promise-util';
import { LanguageClientContributionProvider } from './language-provider/language-client-contribution-provider';

/**
 * Implementation of languages contribution system of the plugin API.
 * Uses for registering new language server which was described in the plug-in.
 */
export class LanguagesContributionMainImpl implements LanguagesContributionMain {
    private readonly languageClientContributionProvider: LanguageClientContributionProvider;
    constructor(protected readonly rpc: RPCProtocol,
        protected readonly container: interfaces.Container,
        protected readonly connectionMain: ConnectionMainImpl) {

        this.languageClientContributionProvider = container.get(LanguageClientContributionProvider);
    }

    /**
     * Creates new client contribution for the language server and register it.
     *
     * @param languageServerInfo an information about the registered language server
     */
    $registerLanguageServerProvider(languageServerInfo: theia.LanguageServerInfo): void {
        const newLanguageContribution = new PluginLanguageClientContribution(this.container.get(Workspace),
            this.container.get(Languages),
            this.container.get(LanguageClientFactory),
            this.connectionMain,
            languageServerInfo,
            this.rpc);

        newLanguageContribution.messageService = this.container.get(MessageService);
        newLanguageContribution.registry = this.container.get(CommandRegistry);
        newLanguageContribution.workspaceService = this.container.get(WorkspaceService);
        newLanguageContribution.connectionProvider = this.container.get(WebSocketConnectionProvider);

        newLanguageContribution.id = languageServerInfo.id;
        newLanguageContribution.name = languageServerInfo.name;
        newLanguageContribution.contains = languageServerInfo.workspaceContains;
        newLanguageContribution.patterns = languageServerInfo.globPatterns;

        this.languageClientContributionProvider.registerLanguageClientContribution(newLanguageContribution);
    }

    /**
     * Removes language client contribution from the registry and clear related connections.
     *
     * @param id language server's id
     */
    $stop(id: string): void {
        this.languageClientContributionProvider.unregisterLanguageClientContribution(id);
        this.connectionMain.ensureConnection(id).then(connection => {
            connection.dispose();
        });
    }

}

/**
 * The language client contribution for the language server which was described in the plug-in.
 */
class PluginLanguageClientContribution extends BaseLanguageClientContribution {
    id: string;
    name: string;
    patterns: string[] | undefined;
    contains: string[] | undefined;

    messageService: MessageService;
    registry: CommandRegistry;
    workspaceService: WorkspaceService;
    connectionProvider: WebSocketConnectionProvider;

    constructor(protected readonly workspace: Workspace,
        protected readonly languages: Languages,
        protected readonly languageClientFactory: LanguageClientFactory,
        protected readonly connectionMain: ConnectionMainImpl,
        protected readonly languageContribution: theia.LanguageServerInfo,
        protected readonly rpc: RPCProtocol
    ) {
        super(workspace, languages, languageClientFactory);
    }

    protected get globPatterns() {
        return this.patterns ? this.patterns : [];
    }

    protected get workspaceContains() {
        return this.contains ? this.contains : [];
    }

    protected async doActivate(toDeactivate: DisposableCollection): Promise<void> {
        // Until the client will be activated, the connection between the plugin and client contribution should be set.
        const connection = await this.connectionMain.ensureConnection(this.id);
        const messageConnection = createMessageConnection(connection.reader as MessageReader, connection.writer as MessageWriter);
        this.deferredConnection.resolve(messageConnection);
        messageConnection.onDispose(() => this.deferredConnection = new Deferred<MessageConnection>());
        if (toDeactivate.disposed) {
            messageConnection.dispose();
            return;
        }
        const proxy = this.rpc.getProxy(MAIN_RPC_CONTEXT.LANGUAGES_CONTRIBUTION_EXT);
        // Asks the plugin to start the process of language server.
        proxy.$start(this.languageContribution);

        toDeactivate.push(Disposable.create(() => this.stop = (async () => {
            try {
                // avoid calling stop if start failed
                await this._languageClient!.onReady();
                // remove all listerens
                await this._languageClient!.stop();
            } catch {
                // if start or stop failed make sure the the connection is closed
                messageConnection.dispose();
                connection.dispose();
            }
        })()));

        toDeactivate.push(messageConnection.onClose(() => this.restart()));
        this.onWillStart(this._languageClient!);
        this._languageClient!.start();
    }

}

/*
 * Copyright (C) 2015-2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */
import { injectable, inject } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { MessageService } from '@theia/core/lib/common';
import { LabelProvider, isNative } from '@theia/core/lib/browser';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import { FileSystem } from '@theia/filesystem/lib/common';
import { FileDialogFactory, DirNode } from '@theia/filesystem/lib/browser';
import { HostedPluginServer } from '../common/plugin-protocol';
import { HostedPluginCommands } from './plugin-api-frontend-contribution';

@injectable()
export class HostedPluginClient {
    @inject(HostedPluginServer)
    protected readonly hostedPluginServer: HostedPluginServer;
    @inject(MessageService)
    protected readonly messageService: MessageService;
    @inject(FileDialogFactory)
    protected readonly fileDialogFactory: FileDialogFactory;
    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;
    @inject(WindowService)
    protected readonly windowService: WindowService;
    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    protected pluginLocation: URI | undefined;
    protected pluginInstanceUri: string | undefined;

    run() {
        if (this.pluginLocation) {
            this.doRunRequest(this.pluginLocation);
        } else {
            this.selectPluginPath().then(() => {
                if (this.pluginLocation) {
                    this.doRunRequest(this.pluginLocation);
                }
            });
        }
    }

    terminate() {
        this.hostedPluginServer.terminateHostedPluginInstance().then(() => {
            this.messageService.info((this.pluginInstanceUri ? this.pluginInstanceUri : 'The instance') + ' has been terminated.');
        }).catch(error => {
            this.messageService.warn(this.getErrorMessage(error));
        });
    }

    async selectPluginPath() {
        const root = await this.workspaceService.root || await this.fileSystem.getCurrentUserHome();
        const rootUri = new URI(root.uri);
        const rootStat = await this.fileSystem.getFileStat(rootUri.toString());
        const name = this.labelProvider.getName(rootUri);
        const label = await this.labelProvider.getIcon(root);
        const rootNode = DirNode.createRoot(rootStat, name, label);
        const dialog = this.fileDialogFactory({ title: HostedPluginCommands.SELECT_PLUGIN_PATH.label! });
        dialog.model.navigateTo(rootNode);
        const node = await dialog.open();
        if (node) {
            if (await this.hostedPluginServer.isPluginValid(node.uri.toString())) {
                this.pluginLocation = node.uri;
                this.messageService.info('Plugin folder is set to: ' + node.uri.toString());
            } else {
                this.messageService.error('Specified folder does not contain valid plugin.');
            }
        }
    }

    protected doRunRequest(pluginLocation: URI): void {
        this.messageService.info('Starting hosted instancse server ...');
        this.hostedPluginServer.runHostedPlugin(pluginLocation.toString()).then(uri => {
            this.pluginInstanceUri = uri;
            if (!isNative) {
                // Open a new tab in case of browser
                this.windowService.openNewWindow(uri.toString());
            }
            this.messageService.info('Hosted instancse is running at: ' + uri);
        }).catch(error => {
            this.messageService.error('Failed to run hosted plugin instanse: ' + this.getErrorMessage(error));
        });
    }

    protected getErrorMessage(error: Error): string {
        return error.message.substring(error.message.lastIndexOf(':') + 1);
    }
}

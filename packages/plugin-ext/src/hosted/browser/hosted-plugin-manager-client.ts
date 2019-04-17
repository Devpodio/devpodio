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

import * as path from 'path';
import { injectable, inject, postConstruct } from 'inversify';
import URI from '@devpodio/core/lib/common/uri';
import { MessageService, Command, Emitter, Event, UriSelection } from '@devpodio/core/lib/common';
import { LabelProvider, isNative, AbstractDialog } from '@devpodio/core/lib/browser';
import { WindowService } from '@devpodio/core/lib/browser/window/window-service';
import { WorkspaceService } from '@devpodio/workspace/lib/browser';
import { FileSystem } from '@devpodio/filesystem/lib/common';
import { OpenFileDialogFactory, DirNode } from '@devpodio/filesystem/lib/browser';
import { HostedPluginServer } from '../../common/plugin-protocol';
import { DebugConfiguration as HostedDebugConfig } from '../../common';
import { DebugSessionManager } from '@devpodio/debug/lib/browser/debug-session-manager';
import { HostedPluginPreferences } from './hosted-plugin-preferences';
import { FileUri } from '@devpodio/core/lib/node/file-uri';

/**
 * Commands to control Hosted plugin instances.
 */
export namespace HostedPluginCommands {
    const HOSTED_PLUGIN_CATEGORY = 'Hosted Plugin';
    export const START: Command = {
        id: 'hosted-plugin:start',
        category: HOSTED_PLUGIN_CATEGORY,
        label: 'Start Instance'
    };

    export const DEBUG: Command = {
        id: 'hosted-plugin:debug',
        category: HOSTED_PLUGIN_CATEGORY,
        label: 'Debug Instance'
    };

    export const STOP: Command = {
        id: 'hosted-plugin:stop',
        category: HOSTED_PLUGIN_CATEGORY,
        label: 'Stop Instance'
    };
    export const RESTART: Command = {
        id: 'hosted-plugin:restart',
        category: HOSTED_PLUGIN_CATEGORY,
        label: 'Restart Instance'
    };
    export const SELECT_PATH: Command = {
        id: 'hosted-plugin:select-path',
        category: HOSTED_PLUGIN_CATEGORY,
        label: 'Select Path'
    };
}

/**
 * Available states of hosted plugin instance.
 */
export enum HostedInstanceState {
    STOPPED = 'stopped',
    STARTING = 'starting',
    RUNNNING = 'running',
    STOPPING = 'stopping',
    FAILED = 'failed'
}

export interface HostedInstanceData {
    state: HostedInstanceState;
    pluginLocation: URI;
}

/**
 * Responsible for UI to set up and control Hosted Plugin Instance.
 */
@injectable()
export class HostedPluginManagerClient {
    private openNewTabAskDialog: OpenHostedInstanceLinkDialog;

    // path to the plugin on the file system
    protected pluginLocation: URI | undefined;

    // URL to the running plugin instance
    protected pluginInstanceURL: string | undefined;

    protected isDebug = false;

    protected readonly stateChanged = new Emitter<HostedInstanceData>();

    get onStateChanged(): Event<HostedInstanceData> {
        return this.stateChanged.event;
    }

    @inject(HostedPluginServer)
    protected readonly hostedPluginServer: HostedPluginServer;
    @inject(MessageService)
    protected readonly messageService: MessageService;
    @inject(OpenFileDialogFactory)
    protected readonly openFileDialogFactory: OpenFileDialogFactory;
    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;
    @inject(WindowService)
    protected readonly windowService: WindowService;
    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;
    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;
    @inject(DebugSessionManager)
    protected readonly debugSessionManager: DebugSessionManager;
    @inject(HostedPluginPreferences)
    protected readonly hostedPluginPreferences: HostedPluginPreferences;

    @postConstruct()
    protected async init() {
        this.openNewTabAskDialog = new OpenHostedInstanceLinkDialog(this.windowService);

        // is needed for case when page is loaded when hosted instance is already running.
        if (await this.hostedPluginServer.isHostedPluginInstanceRunning()) {
            this.pluginLocation = new URI(await this.hostedPluginServer.getHostedPluginURI());
        }
    }

    get lastPluginLocation(): string | undefined {
        if (this.pluginLocation) {
            return this.pluginLocation.toString();
        }
        return undefined;
    }

    async start(debugConfig?: HostedDebugConfig): Promise<void> {
        if (await this.hostedPluginServer.isHostedPluginInstanceRunning()) {
            this.messageService.warn('Hosted instance is already running.');
            return;
        }

        if (!this.pluginLocation) {
            await this.selectPluginPath();
            if (!this.pluginLocation) {
                // selection was cancelled
                return;
            }
        }

        try {
            this.stateChanged.fire({ state: HostedInstanceState.STARTING, pluginLocation: this.pluginLocation });
            this.messageService.info('Starting hosted instance server ...');

            if (debugConfig) {
                this.pluginInstanceURL = await this.hostedPluginServer.runDebugHostedPluginInstance(this.pluginLocation.toString(), debugConfig);
            } else {
                this.pluginInstanceURL = await this.hostedPluginServer.runHostedPluginInstance(this.pluginLocation.toString());
            }
            await this.openPluginWindow();

            this.messageService.info('Hosted instance is running at: ' + this.pluginInstanceURL);
            this.stateChanged.fire({ state: HostedInstanceState.RUNNNING, pluginLocation: this.pluginLocation });
        } catch (error) {
            this.messageService.error('Failed to run hosted plugin instance: ' + this.getErrorMessage(error));
            this.stateChanged.fire({ state: HostedInstanceState.FAILED, pluginLocation: this.pluginLocation });
        }
    }

    async debug(): Promise<void> {
        this.isDebug = true;

        await this.start({ debugMode: this.hostedPluginPreferences['hosted-plugin.debugMode'] });
        const outFiles = this.pluginLocation && [path.join(FileUri.fsPath(this.pluginLocation), '**', '*.js')];
        await this.debugSessionManager.start({
            configuration: {
                type: 'node',
                request: 'attach',
                timeout: 30000,
                name: 'Hosted Plugin',
                smartStep: true,
                sourceMaps: !!outFiles,
                outFiles
            }
        });
    }

    async stop(checkRunning: boolean = true): Promise<void> {
        if (checkRunning && ! await this.hostedPluginServer.isHostedPluginInstanceRunning()) {
            this.messageService.warn('Hosted instance is not running.');
            return;
        }

        try {
            this.stateChanged.fire({ state: HostedInstanceState.STOPPING, pluginLocation: this.pluginLocation! });
            await this.hostedPluginServer.terminateHostedPluginInstance();
            this.messageService.info((this.pluginInstanceURL ? this.pluginInstanceURL : 'The instance') + ' has been terminated.');
            this.stateChanged.fire({ state: HostedInstanceState.STOPPED, pluginLocation: this.pluginLocation! });
        } catch (error) {
            this.messageService.error(this.getErrorMessage(error));
        }
    }

    async restart(): Promise<void> {
        if (await this.hostedPluginServer.isHostedPluginInstanceRunning()) {
            await this.stop(false);

            this.messageService.info('Starting hosted instance server ...');

            // It takes some time before OS released all resources e.g. port.
            // Keep trying to run hosted instance with delay.
            this.stateChanged.fire({ state: HostedInstanceState.STARTING, pluginLocation: this.pluginLocation! });
            let lastError;
            for (let tries = 0; tries < 15; tries++) {
                try {
                    this.pluginInstanceURL = await this.hostedPluginServer.runHostedPluginInstance(this.pluginLocation!.toString());
                    await this.openPluginWindow();
                    this.messageService.info('Hosted instance is running at: ' + this.pluginInstanceURL);
                    this.stateChanged.fire({ state: HostedInstanceState.RUNNNING, pluginLocation: this.pluginLocation! });
                    return;
                } catch (error) {
                    lastError = error;
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            }
            this.messageService.error('Failed to run hosted plugin instance: ' + this.getErrorMessage(lastError));
            this.stateChanged.fire({ state: HostedInstanceState.FAILED, pluginLocation: this.pluginLocation! });
        } else {
            this.messageService.warn('Hosted Plugin instance is not running.');
        }
    }

    /**
     * Creates directory choose dialog and set selected folder into pluginLocation field.
     */
    async selectPluginPath(): Promise<void> {
        const workspaceFolder = (await this.workspaceService.roots)[0] || await this.fileSystem.getCurrentUserHome();
        if (!workspaceFolder) {
            throw new Error('Unable to find the root');
        }

        const name = this.labelProvider.getName(workspaceFolder);
        const label = await this.labelProvider.getIcon(workspaceFolder);
        const rootNode = DirNode.createRoot(workspaceFolder, name, label);

        const dialog = this.openFileDialogFactory({
            title: HostedPluginCommands.SELECT_PATH.label!,
            openLabel: 'Select',
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        });
        dialog.model.navigateTo(rootNode);
        const result = await dialog.open();

        if (UriSelection.is(result)) {
            if (await this.hostedPluginServer.isPluginValid(result.uri.toString())) {
                this.pluginLocation = result.uri;
                this.messageService.info('Plugin folder is set to: ' + result.uri.toString());
            } else {
                this.messageService.error('Specified folder does not contain valid plugin.');
            }
        }
    }

    /**
     * Opens window with URL to the running plugin instance.
     */
    protected async openPluginWindow(): Promise<void> {
        // do nothing for electron browser
        if (isNative) {
            return;
        }

        if (this.pluginInstanceURL) {
            try {
                this.windowService.openNewWindow(this.pluginInstanceURL);
            } catch (err) {
                // browser blocked opening of a new tab
                this.openNewTabAskDialog.showOpenNewTabAskDialog(this.pluginInstanceURL);
            }
        }
    }

    protected getErrorMessage(error: Error): string {
        return error.message.substring(error.message.indexOf(':') + 1);
    }
}

class OpenHostedInstanceLinkDialog extends AbstractDialog<string> {
    protected readonly windowService: WindowService;
    protected readonly openButton: HTMLButtonElement;
    protected readonly messageNode: HTMLDivElement;
    protected readonly linkNode: HTMLAnchorElement;
    value: string;

    constructor(windowService: WindowService) {
        super({
            title: 'Your browser prevented opening of a new tab'
        });
        this.windowService = windowService;

        this.linkNode = document.createElement('a');
        this.linkNode.target = '_blank';
        this.linkNode.setAttribute('style', 'color: var(--theia-ui-dialog-font-color);');
        this.contentNode.appendChild(this.linkNode);

        const messageNode = document.createElement('div');
        messageNode.innerText = 'Hosted instance is started at: ';
        messageNode.appendChild(this.linkNode);
        this.contentNode.appendChild(messageNode);

        this.appendCloseButton();
        this.openButton = this.appendAcceptButton('Open');
    }

    showOpenNewTabAskDialog(uri: string): void {
        this.value = uri;

        this.linkNode.innerHTML = uri;
        this.linkNode.href = uri;
        this.openButton.onclick = () => {
            this.windowService.openNewWindow(uri);
        };

        this.open();
    }
}

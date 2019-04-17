/********************************************************************************
 * Copyright (C) 2018-2019 Red Hat, Inc.
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

// tslint:disable:no-any

import * as theia from '@devpodio/plugin';
import { BackendInitializationFn, PluginAPIFactory, Plugin, emptyPlugin } from '@devpodio/plugin-ext';

export const VSCODE_DEFAULT_API_VERSION = '1.32.3';

/** Set up en as a default locale for VS Code extensions using vscode-nls */
process.env['VSCODE_NLS_CONFIG'] = JSON.stringify({ locale: 'en', availableLanguages: {} });
process.env['VSCODE_PID'] = process.env['THEIA_PARENT_PID'];

const pluginsApiImpl = new Map<string, typeof theia>();
const plugins = new Array<Plugin>();
let defaultApi: typeof theia;
let isLoadOverride = false;
let pluginApiFactory: PluginAPIFactory;

export const doInitialization: BackendInitializationFn = (apiFactory: PluginAPIFactory, plugin: Plugin) => {
    const vscode = apiFactory(plugin);

    // replace command API as it will send only the ID as a string parameter
    const registerCommand = vscode.commands.registerCommand;
    vscode.commands.registerCommand = function (command: any, handler?: <T>(...args: any[]) => T | Thenable<T>): any {
        // use of the ID when registering commands
        if (typeof command === 'string' && handler) {
            return vscode.commands.registerHandler(command, handler);
        }
        return registerCommand(command, handler);
    };

    // replace createWebviewPanel API for override html setter
    const createWebviewPanel = vscode.window.createWebviewPanel;
    vscode.window.createWebviewPanel = function (viewType: string, title: string, showOptions: any, options: any | undefined): any {
        const panel = createWebviewPanel(viewType, title, showOptions, options);
        // redefine property
        Object.defineProperty(panel.webview, 'html', {
            set: function (html: string) {
                const newHtml = html.replace(new RegExp('vscode-resource:/', 'g'), '/webview/');
                this.checkIsDisposed();
                if (this._html !== newHtml) {
                    this._html = newHtml;
                    this.proxy.$setHtml(this.viewId, newHtml);
                }
            }
        });

        return panel;
    };

    // use Theia plugin api instead vscode extensions
    (<any>vscode).extensions = {
        get all(): any[] {
            return vscode.plugins.all.map(p => withExtensionPath(p));
        },
        getExtension(pluginId: string): any | undefined {
            return withExtensionPath(vscode.plugins.getPlugin(pluginId));
        }
    };

    // override the version for vscode to be a VSCode version
    (<any>vscode).version = process.env['VSCODE_API_VERSION'] || VSCODE_DEFAULT_API_VERSION;

    pluginsApiImpl.set(plugin.model.id, vscode);
    plugins.push(plugin);
    pluginApiFactory = apiFactory;

    if (!isLoadOverride) {
        overrideInternalLoad();
        isLoadOverride = true;
    }
};

function overrideInternalLoad(): void {
    const module = require('module');
    const vscodeModuleName = 'vscode';
    // save original load method
    const internalLoad = module._load;

    // if we try to resolve theia module, return the filename entry to use cache.
    // tslint:disable-next-line:no-any
    module._load = function (request: string, parent: any, isMain: {}) {
        if (request !== vscodeModuleName) {
            return internalLoad.apply(this, arguments);
        }

        const plugin = findPlugin(parent.filename);
        if (plugin) {
            const apiImpl = pluginsApiImpl.get(plugin.model.id);
            return apiImpl;
        }

        if (!defaultApi) {
            console.warn(`Could not identify plugin for 'Theia' require call from ${parent.filename}`);
            defaultApi = pluginApiFactory(emptyPlugin);
        }

        return defaultApi;
    };
}

function findPlugin(filePath: string): Plugin | undefined {
    return plugins.find(plugin => filePath.startsWith(plugin.pluginFolder));
}

function withExtensionPath(plugin: any | undefined): any | undefined {
    if (plugin && plugin.pluginPath) {
        plugin.extensionPath = plugin.pluginPath;
    }

    return plugin;
}

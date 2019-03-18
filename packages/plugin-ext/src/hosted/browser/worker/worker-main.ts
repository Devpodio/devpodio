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

import { Emitter } from '@devpodio/core/lib/common/event';
import { RPCProtocolImpl } from '../../../api/rpc-protocol';
import { PluginManagerExtImpl } from '../../../plugin/plugin-manager';
import { MAIN_RPC_CONTEXT, Plugin, emptyPlugin } from '../../../api/plugin-api';
import { createAPIFactory } from '../../../plugin/plugin-context';
import { getPluginId, PluginMetadata } from '../../../common/plugin-protocol';
import * as theia from '@devpodio/plugin';
import { EnvExtImpl } from '../../../plugin/env';
import { PreferenceRegistryExtImpl } from '../../../plugin/preference-registry';
import { ExtPluginApi } from '../../../common/plugin-ext-api-contribution';
import { createDebugExtStub } from './debug-stub';
import { EditorsAndDocumentsExtImpl } from '../../../plugin/editors-and-documents';
import { WorkspaceExtImpl } from '../../../plugin/workspace';

// tslint:disable-next-line:no-any
const ctx = self as any;

const pluginsApiImpl = new Map<string, typeof theia>();
const pluginsModulesNames = new Map<string, Plugin>();

const emitter = new Emitter();
const rpc = new RPCProtocolImpl({
    onMessage: emitter.event,
    send: (m: {}) => {
        ctx.postMessage(m);
    }
});
// tslint:disable-next-line:no-any
addEventListener('message', (message: any) => {
    emitter.fire(message.data);
});
function initialize(contextPath: string, pluginMetadata: PluginMetadata): void {
    ctx.importScripts('/context/' + contextPath);
}
const envExt = new EnvExtImpl(rpc);
const editorsAndDocuments = new EditorsAndDocumentsExtImpl(rpc);
const workspaceExt = new WorkspaceExtImpl(rpc, editorsAndDocuments);
const preferenceRegistryExt = new PreferenceRegistryExtImpl(rpc, workspaceExt);
const debugExt = createDebugExtStub(rpc);

const pluginManager = new PluginManagerExtImpl({
    // tslint:disable-next-line:no-any
    loadPlugin(plugin: Plugin): any {
        if (isElectron()) {
            ctx.importScripts(plugin.pluginPath);
        } else {
            ctx.importScripts('/hostedPlugin/' + getPluginId(plugin.model) + '/' + plugin.pluginPath);
        }

        if (plugin.lifecycle.frontendModuleName) {
            if (!ctx[plugin.lifecycle.frontendModuleName]) {
                console.error(`WebWorker: Cannot start plugin "${plugin.model.name}". Frontend plugin not found: "${plugin.lifecycle.frontendModuleName}"`);
                return;
            }
            return ctx[plugin.lifecycle.frontendModuleName];
        }
    },
    init(rawPluginData: PluginMetadata[]): [Plugin[], Plugin[]] {
        const result: Plugin[] = [];
        const foreign: Plugin[] = [];
        for (const plg of rawPluginData) {
            const pluginModel = plg.model;
            const pluginLifecycle = plg.lifecycle;
            if (pluginModel.entryPoint!.frontend) {
                let frontendInitPath = pluginLifecycle.frontendInitPath;
                if (frontendInitPath) {
                    initialize(frontendInitPath, plg);
                } else {
                    frontendInitPath = '';
                }
                const plugin: Plugin = {
                    pluginPath: pluginModel.entryPoint.frontend!,
                    pluginFolder: plg.source.packagePath,
                    model: pluginModel,
                    lifecycle: pluginLifecycle,
                    rawModel: plg.source
                };
                result.push(plugin);
                const apiImpl = apiFactory(plugin);
                pluginsApiImpl.set(plugin.model.id, apiImpl);
                pluginsModulesNames.set(plugin.lifecycle.frontendModuleName!, plugin);
            } else {
                foreign.push({
                    pluginPath: pluginModel.entryPoint.backend!,
                    pluginFolder: plg.source.packagePath,
                    model: pluginModel,
                    lifecycle: pluginLifecycle,
                    rawModel: plg.source
                });
            }
        }

        return [result, foreign];
    },
    initExtApi(extApi: ExtPluginApi[]) {
        for (const api of extApi) {
            try {
                if (api.frontendExtApi) {
                    ctx.importScripts(api.frontendExtApi.initPath);
                    ctx[api.frontendExtApi.initVariable][api.frontendExtApi.initFunction](rpc, pluginsModulesNames);
                }

            } catch (e) {
                console.error(e);
            }
        }
    }
}, envExt, preferenceRegistryExt, rpc);

const apiFactory = createAPIFactory(
    rpc,
    pluginManager,
    envExt,
    debugExt,
    preferenceRegistryExt,
    editorsAndDocuments,
    workspaceExt
);
let defaultApi: typeof theia;

const handler = {
    // tslint:disable-next-line:no-any
    get: (target: any, name: string) => {
        const plugin = pluginsModulesNames.get(name);
        if (plugin) {
            const apiImpl = pluginsApiImpl.get(plugin.model.id);
            return apiImpl;
        }

        if (!defaultApi) {
            defaultApi = apiFactory(emptyPlugin);
        }

        return defaultApi;
    }
};
// tslint:disable-next-line:no-null-keyword
ctx['theia'] = new Proxy(Object.create(null), handler);

rpc.set(MAIN_RPC_CONTEXT.HOSTED_PLUGIN_MANAGER_EXT, pluginManager);
rpc.set(MAIN_RPC_CONTEXT.EDITORS_AND_DOCUMENTS_EXT, editorsAndDocuments);
rpc.set(MAIN_RPC_CONTEXT.WORKSPACE_EXT, workspaceExt);
rpc.set(MAIN_RPC_CONTEXT.PREFERENCE_REGISTRY_EXT, preferenceRegistryExt);

function isElectron() {
    if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
        return true;
    }

    return false;
}

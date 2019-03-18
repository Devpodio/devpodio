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
import { bindContributionProvider } from '@theia/core/lib/common/contribution-provider';
import { CliContribution } from '@theia/core/lib/node/cli';
import { HostedInstanceManager, NodeHostedPluginRunner } from './hosted-instance-manager';
import { HostedPluginUriPostProcessorSymbolName } from './hosted-plugin-uri-postprocessor';
import { ConnectionHandler, JsonRpcConnectionHandler } from '@devpodio/core/lib/common/messaging';
import { BackendApplicationContribution } from '@devpodio/core/lib/node/backend-application';
import { MetadataScanner } from './metadata-scanner';
import { HostedPluginServerImpl } from './plugin-service';
import { HostedPluginReader } from './plugin-reader';
import { HostedPluginSupport } from './hosted-plugin';
import { TheiaPluginScanner } from './scanners/scanner-theia';
import { HostedPluginsManager, HostedPluginsManagerImpl } from './hosted-plugins-manager';
import { HostedPluginServer, PluginScanner, HostedPluginClient, hostedServicePath, PluginDeployerHandler } from '../../common/plugin-protocol';
import { GrammarsReader } from './scanners/grammars-reader';
import { HostedPluginProcess } from './hosted-plugin-process';
import { ExtPluginApiProvider } from '../../common/plugin-ext-api-contribution';
import { HostedPluginCliContribution } from './hosted-plugin-cli-contribution';

export function bindCommonHostedBackend(bind: interfaces.Bind): void {
    bind(HostedPluginCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(HostedPluginCliContribution);

    bind(HostedPluginReader).toSelf().inSingletonScope();

    bind(HostedPluginServerImpl).toSelf().inSingletonScope();
    bind(HostedPluginServer).toService(HostedPluginServerImpl);
    bind(PluginDeployerHandler).toService(HostedPluginServerImpl);

    bind(HostedPluginSupport).toSelf().inSingletonScope();
    bind(MetadataScanner).toSelf().inSingletonScope();
    bind(HostedPluginsManager).to(HostedPluginsManagerImpl).inSingletonScope();

    bind(HostedPluginProcess).toSelf().inSingletonScope();

    bind(BackendApplicationContribution).toService(HostedPluginReader);

    bind(ConnectionHandler).toDynamicValue(ctx =>
        new JsonRpcConnectionHandler<HostedPluginClient>(hostedServicePath, client => {
            const server = ctx.container.get<HostedPluginServer>(HostedPluginServer);
            server.setClient(client);
            // FIXME: handle multiple remote connections
            /*
            client.onDidCloseConnection(() => server.dispose());*/
            return server;
        })
    ).inSingletonScope();

    bind(GrammarsReader).toSelf().inSingletonScope();
}

export function bindHostedBackend(bind: interfaces.Bind): void {
    bindCommonHostedBackend(bind);

    bind(HostedInstanceManager).to(NodeHostedPluginRunner).inSingletonScope();
    bind(PluginScanner).to(TheiaPluginScanner).inSingletonScope();
    bindContributionProvider(bind, Symbol.for(HostedPluginUriPostProcessorSymbolName));
    bindContributionProvider(bind, Symbol.for(ExtPluginApiProvider));
}

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
import { ConnectionContainerModule } from '@theia/core/lib/node/messaging/connection-container-module';
import { HostedInstanceManager, NodeHostedPluginRunner } from './hosted-instance-manager';
import { HostedPluginUriPostProcessorSymbolName } from './hosted-plugin-uri-postprocessor';
import { BackendApplicationContribution } from '@theia/core/lib/node/backend-application';
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
import { HostedPluginDeployerHandler } from './hosted-plugin-deployer-handler';

const commonHostedConnectionModule = ConnectionContainerModule.create(({ bind, bindBackendService }) => {
    bind(HostedPluginProcess).toSelf().inSingletonScope();
    bind(HostedPluginSupport).toSelf().inSingletonScope();

    bind(HostedPluginsManagerImpl).toSelf().inSingletonScope();
    bind(HostedPluginsManager).toService(HostedPluginsManagerImpl);

    bindContributionProvider(bind, Symbol.for(ExtPluginApiProvider));
    bind(HostedPluginServerImpl).toSelf().inSingletonScope();
    bind(HostedPluginServer).toService(HostedPluginServerImpl);
    bindBackendService<HostedPluginServer, HostedPluginClient>(hostedServicePath, HostedPluginServer, (server, client) => {
        server.setClient(client);
        client.onDidCloseConnection(() => server.dispose());
        return server;
    });
});

export function bindCommonHostedBackend(bind: interfaces.Bind): void {
    bind(HostedPluginCliContribution).toSelf().inSingletonScope();
    bind(CliContribution).toService(HostedPluginCliContribution);

    bind(MetadataScanner).toSelf().inSingletonScope();
    bind(HostedPluginReader).toSelf().inSingletonScope();
    bind(BackendApplicationContribution).toService(HostedPluginReader);

    bind(HostedPluginDeployerHandler).toSelf().inSingletonScope();
    bind(PluginDeployerHandler).toService(HostedPluginDeployerHandler);

    bind(GrammarsReader).toSelf().inSingletonScope();

    bind(ConnectionContainerModule).toConstantValue(commonHostedConnectionModule);
}

const hostedBackendConnectionModule = ConnectionContainerModule.create(({ bind }) => {
    bindContributionProvider(bind, Symbol.for(HostedPluginUriPostProcessorSymbolName));
    bind(HostedInstanceManager).to(NodeHostedPluginRunner).inSingletonScope();
});

export function bindHostedBackend(bind: interfaces.Bind): void {
    bindCommonHostedBackend(bind);
    bind(ConnectionContainerModule).toConstantValue(hostedBackendConnectionModule);

    bind(PluginScanner).to(TheiaPluginScanner).inSingletonScope();
}

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

import '../../src/browser/style/index.css';
import 'font-awesome/css/font-awesome.min.css';
import 'file-icons-js/css/style.css';

import { ContainerModule } from 'inversify';
import {
    bindContributionProvider,
    SelectionService,
    ResourceProvider, ResourceResolver, DefaultResourceProvider,
    CommandContribution, CommandRegistry, CommandService, commandServicePath,
    MenuModelRegistry, MenuContribution,
    MessageService,
    MessageClient,
    InMemoryResources,
    messageServicePath
} from '../common';
import { KeybindingRegistry, KeybindingContext, KeybindingContribution } from './keybinding';
import { FrontendApplication, FrontendApplicationContribution, DefaultFrontendApplicationContribution } from './frontend-application';
import { DefaultOpenerService, OpenerService, OpenHandler } from './opener-service';
import { HttpOpenHandler } from './http-open-handler';
import { CommonFrontendContribution } from './common-frontend-contribution';
import {
    QuickOpenService, QuickCommandService, QuickCommandFrontendContribution, QuickOpenContribution,
    QuickOpenHandlerRegistry, CommandQuickOpenContribution, HelpQuickOpenHandler,
    QuickOpenFrontendContribution, PrefixQuickOpenService, QuickInputService
} from './quick-open';
import { LocalStorageService, StorageService } from './storage-service';
import { WidgetFactory, WidgetManager } from './widget-manager';
import {
    ApplicationShell, ApplicationShellOptions, DockPanelRenderer, TabBarRenderer,
    TabBarRendererFactory, ShellLayoutRestorer,
    SidePanelHandler, SidePanelHandlerFactory,
    SplitPositionHandler, DockPanelRendererFactory
} from './shell';
import { StatusBar, StatusBarImpl } from './status-bar/status-bar';
import { LabelParser } from './label-parser';
import { LabelProvider, LabelProviderContribution, DefaultUriLabelProviderContribution } from './label-provider';
import {
    PreferenceProviderProvider, PreferenceProvider, PreferenceScope, PreferenceService,
    PreferenceServiceImpl, bindPreferenceSchemaProvider, PreferenceSchemaProvider
} from './preferences';
import { ContextMenuRenderer } from './context-menu-renderer';
import { ThemingCommandContribution, ThemeService, BuiltinThemeProvider } from './theming';
import { ConnectionStatusService, FrontendConnectionStatusService, ApplicationConnectionStatusContribution, PingService } from './connection-status-service';
import { DiffUriLabelProviderContribution } from './diff-uris';
import { ApplicationServer, applicationPath } from '../common/application-protocol';
import { WebSocketConnectionProvider } from './messaging';
import { AboutDialog, AboutDialogProps } from './about-dialog';
import { EnvVariablesServer, envVariablesPath } from './../common/env-variables';
import { FrontendApplicationStateService } from './frontend-application-state';
import { JsonSchemaStore } from './json-schema-store';
import { TabBarToolbarRegistry, TabBarToolbarContribution, TabBarToolbarFactory, TabBarToolbar } from './shell/tab-bar-toolbar';
import { bindCorePreferences } from './core-preferences';
import { QuickPickServiceImpl } from './quick-open/quick-pick-service-impl';
import { QuickPickService, quickPickServicePath } from '../common/quick-pick-service';
import { ContextKeyService } from './context-key-service';
import { ResourceContextKey } from './resource-context-key';
import { KeyboardLayoutService } from './keyboard/keyboard-layout-service';

export const frontendApplicationModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    const themeService = ThemeService.get();
    themeService.register(...BuiltinThemeProvider.themes);
    themeService.startupTheme();

    bind(FrontendApplication).toSelf().inSingletonScope();
    bind(FrontendApplicationStateService).toSelf().inSingletonScope();
    bind(DefaultFrontendApplicationContribution).toSelf();
    bindContributionProvider(bind, FrontendApplicationContribution);

    bind(ApplicationShellOptions).toConstantValue({});
    bind(ApplicationShell).toSelf().inSingletonScope();
    bind(SidePanelHandlerFactory).toAutoFactory(SidePanelHandler);
    bind(SidePanelHandler).toSelf();
    bind(SplitPositionHandler).toSelf().inSingletonScope();

    bindContributionProvider(bind, TabBarToolbarContribution);
    bind(TabBarToolbarRegistry).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TabBarToolbarRegistry);
    bind(TabBarToolbarFactory).toFactory(context => () => {
        const { container } = context;
        const commandRegistry = container.get(CommandRegistry);
        const labelParser = container.get(LabelParser);
        return new TabBarToolbar(commandRegistry, labelParser);
    });

    bind(DockPanelRendererFactory).toFactory(context => () => {
        const { container } = context;
        const tabBarToolbarRegistry = container.get(TabBarToolbarRegistry);
        const tabBarRendererFactory: () => TabBarRenderer = container.get(TabBarRendererFactory);
        const tabBarToolbarFactory: () => TabBarToolbar = container.get(TabBarToolbarFactory);
        return new DockPanelRenderer(tabBarRendererFactory, tabBarToolbarRegistry, tabBarToolbarFactory);
    });
    bind(DockPanelRenderer).toSelf();
    bind(TabBarRendererFactory).toFactory(context => () => {
        const contextMenuRenderer = context.container.get<ContextMenuRenderer>(ContextMenuRenderer);
        return new TabBarRenderer(contextMenuRenderer);
    });

    bindContributionProvider(bind, OpenHandler);
    bind(DefaultOpenerService).toSelf().inSingletonScope();
    bind(OpenerService).toService(DefaultOpenerService);
    bind(HttpOpenHandler).toSelf().inSingletonScope();
    bind(OpenHandler).toService(HttpOpenHandler);

    bindContributionProvider(bind, WidgetFactory);
    bind(WidgetManager).toSelf().inSingletonScope();
    bind(ShellLayoutRestorer).toSelf().inSingletonScope();
    bind(CommandContribution).toService(ShellLayoutRestorer);

    bind(DefaultResourceProvider).toSelf().inSingletonScope();
    bind(ResourceProvider).toProvider(context =>
        uri => context.container.get(DefaultResourceProvider).get(uri)
    );
    bindContributionProvider(bind, ResourceResolver);
    bind(InMemoryResources).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(InMemoryResources);

    bind(SelectionService).toSelf().inSingletonScope();
    bind(CommandRegistry).toSelf().inSingletonScope().onActivation(({ container }, registry) => {
        WebSocketConnectionProvider.createProxy(container, commandServicePath, registry);
        return registry;
    });
    bind(CommandService).toService(CommandRegistry);
    bindContributionProvider(bind, CommandContribution);
    bind(QuickOpenContribution).to(CommandQuickOpenContribution);

    bind(ContextKeyService).toSelf().inSingletonScope();

    bind(MenuModelRegistry).toSelf().inSingletonScope();
    bindContributionProvider(bind, MenuContribution);

    bind(KeyboardLayoutService).toSelf().inSingletonScope();
    bind(KeybindingRegistry).toSelf().inSingletonScope();
    bindContributionProvider(bind, KeybindingContext);
    bindContributionProvider(bind, KeybindingContribution);

    bind(MessageClient).toSelf().inSingletonScope();
    bind(MessageService).toSelf().inSingletonScope().onActivation(({ container }, messages) => {
        const client = container.get(MessageClient);
        WebSocketConnectionProvider.createProxy(container, messageServicePath, client);
        return messages;
    });

    bind(ResourceContextKey).toSelf().inSingletonScope();
    bind(CommonFrontendContribution).toSelf().inSingletonScope();
    [FrontendApplicationContribution, CommandContribution, KeybindingContribution, MenuContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(CommonFrontendContribution)
    );

    bind(QuickOpenService).toSelf().inSingletonScope();
    bind(QuickInputService).toSelf().inSingletonScope();
    bind(QuickCommandService).toSelf().inSingletonScope();
    bind(QuickCommandFrontendContribution).toSelf().inSingletonScope();
    [CommandContribution, KeybindingContribution, MenuContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(QuickCommandFrontendContribution)
    );

    bind(QuickPickService).to(QuickPickServiceImpl).inSingletonScope().onActivation(({ container }, quickPickService) => {
        WebSocketConnectionProvider.createProxy(container, quickPickServicePath, quickPickService);
        return quickPickService;
    });

    bind(PrefixQuickOpenService).toSelf().inSingletonScope();
    bindContributionProvider(bind, QuickOpenContribution);
    bind(QuickOpenHandlerRegistry).toSelf().inSingletonScope();
    bind(QuickOpenFrontendContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(QuickOpenFrontendContribution);

    bind(HelpQuickOpenHandler).toSelf().inSingletonScope();
    bind(QuickOpenContribution).toService(HelpQuickOpenHandler);

    bind(LocalStorageService).toSelf().inSingletonScope();
    bind(StorageService).toService(LocalStorageService);

    bind(StatusBarImpl).toSelf().inSingletonScope();
    bind(StatusBar).toService(StatusBarImpl);
    bind(LabelParser).toSelf().inSingletonScope();

    bindContributionProvider(bind, LabelProviderContribution);
    bind(LabelProvider).toSelf().inSingletonScope();
    bind(LabelProviderContribution).to(DefaultUriLabelProviderContribution).inSingletonScope();
    bind(LabelProviderContribution).to(DiffUriLabelProviderContribution).inSingletonScope();

    bind(PreferenceProvider).toSelf().inSingletonScope().whenTargetNamed(PreferenceScope.User);
    bind(PreferenceProvider).toSelf().inSingletonScope().whenTargetNamed(PreferenceScope.Workspace);
    bind(PreferenceProvider).toSelf().inSingletonScope().whenTargetNamed(PreferenceScope.Folder);
    bind(PreferenceProviderProvider).toFactory(ctx => (scope: PreferenceScope) => {
        if (scope === PreferenceScope.Default) {
            return ctx.container.get(PreferenceSchemaProvider);
        }
        return ctx.container.getNamed(PreferenceProvider, scope);
    });
    bind(PreferenceServiceImpl).toSelf().inSingletonScope();
    bind(PreferenceService).toService(PreferenceServiceImpl);
    bind(FrontendApplicationContribution).toService(PreferenceServiceImpl);
    bindPreferenceSchemaProvider(bind);

    bind(JsonSchemaStore).toSelf().inSingletonScope();

    bind(PingService).toDynamicValue(ctx => {
        // let's reuse a simple and cheap service from this package
        const envServer: EnvVariablesServer = ctx.container.get(EnvVariablesServer);
        return {
            ping() {
                return envServer.getValue('does_not_matter');
            }
        };
    });
    bind(FrontendConnectionStatusService).toSelf().inSingletonScope();
    bind(ConnectionStatusService).toService(FrontendConnectionStatusService);
    bind(FrontendApplicationContribution).toService(FrontendConnectionStatusService);
    bind(ApplicationConnectionStatusContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ApplicationConnectionStatusContribution);

    bind(ApplicationServer).toDynamicValue(ctx => {
        const provider = ctx.container.get(WebSocketConnectionProvider);
        return provider.createProxy<ApplicationServer>(applicationPath);
    }).inSingletonScope();

    bind(AboutDialog).toSelf().inSingletonScope();
    bind(AboutDialogProps).toConstantValue({ title: 'Theia' });

    bind(EnvVariablesServer).toDynamicValue(ctx => {
        const connection = ctx.container.get(WebSocketConnectionProvider);
        return connection.createProxy<EnvVariablesServer>(envVariablesPath);
    }).inSingletonScope();

    bind(ThemeService).toDynamicValue(() => ThemeService.get());

    bind(ThemingCommandContribution).toSelf().inSingletonScope();
    [CommandContribution, MenuContribution].forEach(serviceIdentifier =>
        bind(serviceIdentifier).toService(ThemingCommandContribution),
    );

    bindCorePreferences(bind);
});

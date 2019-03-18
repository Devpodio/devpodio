/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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
import '../../src/browser/style/symbol-sprite.svg';
import '../../src/browser/style/symbol-icons.css';

import { ContainerModule, decorate, injectable, interfaces } from 'inversify';
import { MenuContribution, CommandContribution } from '@devpodio/core/lib/common';
import { QuickOpenService, FrontendApplicationContribution, KeybindingContribution, PreferenceServiceImpl } from '@devpodio/core/lib/browser';
import { Languages, Workspace } from '@devpodio/languages/lib/browser';
import { TextEditorProvider, DiffNavigatorProvider } from '@devpodio/editor/lib/browser';
import { StrictEditorTextFocusContext } from '@devpodio/editor/lib/browser/editor-keybinding-contexts';
import { MonacoToProtocolConverter, ProtocolToMonacoConverter } from 'monaco-languageclient';
import { MonacoEditorProvider } from './monaco-editor-provider';
import { MonacoEditorMenuContribution } from './monaco-menu';
import { MonacoEditorCommandHandlers } from './monaco-command';
import { MonacoKeybindingContribution } from './monaco-keybinding';
import { MonacoLanguages } from './monaco-languages';
import { MonacoWorkspace } from './monaco-workspace';
import { MonacoConfigurations } from './monaco-configurations';
import { MonacoEditorService } from './monaco-editor-service';
import { MonacoTextModelService } from './monaco-text-model-service';
import { MonacoContextMenuService } from './monaco-context-menu';
import { MonacoOutlineContribution } from './monaco-outline-contribution';
import { MonacoStatusBarContribution } from './monaco-status-bar-contribution';
import { MonacoCommandService, MonacoCommandServiceFactory } from './monaco-command-service';
import { MonacoCommandRegistry } from './monaco-command-registry';
import { MonacoQuickOpenService } from './monaco-quick-open-service';
import { MonacoDiffNavigatorFactory } from './monaco-diff-navigator-factory';
import { MonacoStrictEditorTextFocusContext } from './monaco-keybinding-contexts';
import { MonacoFrontendApplicationContribution } from './monaco-frontend-application-contribution';
import MonacoTextmateModuleBinder from './textmate/monaco-textmate-frontend-bindings';
import { MonacoSemanticHighlightingService } from './monaco-semantic-highlighting-service';
import { SemanticHighlightingService } from '@devpodio/editor/lib/browser/semantic-highlight/semantic-highlighting-service';
import { MonacoBulkEditService } from './monaco-bulk-edit-service';
import { MonacoOutlineDecorator } from './monaco-outline-decorator';
import { OutlineTreeDecorator } from '@devpodio/outline-view/lib/browser/outline-decorator-service';
import { MonacoSnippetSuggestProvider } from './monaco-snippet-suggest-provider';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { MonacoContextKeyService } from './monaco-context-key-service';

const deepmerge: (args: object[]) => object = require('deepmerge').default.all;

decorate(injectable(), MonacoToProtocolConverter);
decorate(injectable(), ProtocolToMonacoConverter);
decorate(injectable(), monaco.contextKeyService.ContextKeyService);

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(MonacoContextKeyService).toSelf().inSingletonScope();
    rebind(ContextKeyService).toService(MonacoContextKeyService);

    bind(MonacoSnippetSuggestProvider).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).to(MonacoFrontendApplicationContribution).inSingletonScope();

    bind(MonacoToProtocolConverter).toSelf().inSingletonScope();
    bind(ProtocolToMonacoConverter).toSelf().inSingletonScope();

    bind(MonacoLanguages).toSelf().inSingletonScope();
    bind(Languages).toService(MonacoLanguages);

    bind(MonacoConfigurations).toSelf().inSingletonScope();
    bind(MonacoWorkspace).toSelf().inSingletonScope();
    bind(Workspace).toService(MonacoWorkspace);

    bind(MonacoConfigurationService).toDynamicValue(({ container }) =>
        createMonacoConfigurationService(container)
    ).inSingletonScope();
    bind(monaco.contextKeyService.ContextKeyService).toDynamicValue(({ container }) =>
        new monaco.contextKeyService.ContextKeyService(container.get(MonacoConfigurationService))
    ).inSingletonScope();
    bind(MonacoBulkEditService).toSelf().inSingletonScope();
    bind(MonacoEditorService).toSelf().inSingletonScope();
    bind(MonacoTextModelService).toSelf().inSingletonScope();
    bind(MonacoContextMenuService).toSelf().inSingletonScope();
    bind(MonacoEditorProvider).toSelf().inSingletonScope();
    bind(MonacoCommandService).toSelf().inTransientScope();
    bind(MonacoCommandServiceFactory).toAutoFactory(MonacoCommandService);
    bind(TextEditorProvider).toProvider(context =>
        uri => context.container.get(MonacoEditorProvider).get(uri)
    );
    bind(MonacoDiffNavigatorFactory).toSelf().inSingletonScope();
    bind(DiffNavigatorProvider).toFactory(context =>
        editor => context.container.get(MonacoEditorProvider).getDiffNavigator(editor)
    );

    bind(MonacoOutlineContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoOutlineContribution);

    bind(MonacoStatusBarContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(MonacoStatusBarContribution);

    bind(MonacoCommandRegistry).toSelf().inSingletonScope();
    bind(CommandContribution).to(MonacoEditorCommandHandlers).inSingletonScope();
    bind(MenuContribution).to(MonacoEditorMenuContribution).inSingletonScope();
    bind(KeybindingContribution).to(MonacoKeybindingContribution).inSingletonScope();
    rebind(StrictEditorTextFocusContext).to(MonacoStrictEditorTextFocusContext).inSingletonScope();

    bind(MonacoQuickOpenService).toSelf().inSingletonScope();
    rebind(QuickOpenService).toService(MonacoQuickOpenService);

    MonacoTextmateModuleBinder(bind, unbind, isBound, rebind);

    bind(MonacoSemanticHighlightingService).toSelf().inSingletonScope();
    rebind(SemanticHighlightingService).to(MonacoSemanticHighlightingService).inSingletonScope();

    bind(MonacoOutlineDecorator).toSelf().inSingletonScope();
    bind(OutlineTreeDecorator).toService(MonacoOutlineDecorator);
});

export const MonacoConfigurationService = Symbol('MonacoConfigurationService');
export function createMonacoConfigurationService(container: interfaces.Container): monaco.services.IConfigurationService {
    const configurations = container.get(MonacoConfigurations);
    const preferences = container.get(PreferenceServiceImpl);
    const service = monaco.services.StaticServices.configurationService.get();
    const _configuration = service._configuration;

    const getValue = _configuration.getValue.bind(_configuration);
    _configuration.getValue = (section, overrides, workspace) => {
        const preferenceConfig = configurations.getConfiguration();
        if (section) {
            const value = preferenceConfig.get(section);
            return value !== undefined ? value : getValue(section, overrides, workspace);
        }
        const simpleConfig = getValue(section, overrides, workspace);
        if (typeof simpleConfig === 'object') {
            return deepmerge([{}, simpleConfig, preferenceConfig.toJSON()]);
        }
        return preferenceConfig.toJSON();
    };

    preferences.onPreferencesChanged(changes => {
        const event = new monaco.services.ConfigurationChangeEvent();
        event.change(Object.keys(changes));
        service._onDidChangeConfiguration.fire(event);
    });

    return service;
}

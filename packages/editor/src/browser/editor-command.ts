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

import { inject, injectable } from 'inversify';
import { CommandContribution, CommandRegistry, Command } from '@devpodio/core/lib/common';
import URI from '@devpodio/core/lib/common/uri';
import { CommonCommands, PreferenceService, QuickPickItem, QuickPickService, LabelProvider, QuickPickValue } from '@devpodio/core/lib/browser';
import { Languages, Language } from '@devpodio/languages/lib/browser';
import { EditorManager } from './editor-manager';

export namespace EditorCommands {

    const EDITOR_CATEGORY = 'Editor';

    /**
     * Show editor references
     */
    export const SHOW_REFERENCES: Command = {
        id: 'textEditor.commands.showReferences'
    };
    /**
     * Change indentation configuration (i.e., indent using tabs / spaces, and how many spaces per tab)
     */
    export const CONFIG_INDENTATION: Command = {
        id: 'textEditor.commands.configIndentation'
    };

    export const CONFIG_EOL: Command = {
        id: 'textEditor.commands.configEol',
        category: EDITOR_CATEGORY,
        label: 'Change End of Line Sequence'
    };

    export const INDENT_USING_SPACES: Command = {
        id: 'textEditor.commands.indentUsingSpaces',
        category: EDITOR_CATEGORY,
        label: 'Indent Using Spaces'
    };
    export const INDENT_USING_TABS: Command = {
        id: 'textEditor.commands.indentUsingTabs',
        category: EDITOR_CATEGORY,
        label: 'Indent Using Tabs'
    };
    export const CHANGE_LANGUAGE: Command = {
        id: 'textEditor.change.language',
        category: EDITOR_CATEGORY,
        label: 'Change Language Mode'
    };

    /**
     * Command for going back to the last editor navigation location.
     */
    export const GO_BACK: Command = {
        id: 'textEditor.commands.go.back',
        category: EDITOR_CATEGORY,
        label: 'Go Back'
    };
    /**
     * Command for going to the forthcoming editor navigation location.
     */
    export const GO_FORWARD: Command = {
        id: 'textEditor.commands.go.forward',
        category: EDITOR_CATEGORY,
        label: 'Go Forward'
    };
    /**
     * Command that reveals the last text edit location, if any.
     */
    export const GO_LAST_EDIT: Command = {
        id: 'textEditor.commands.go.lastEdit',
        category: EDITOR_CATEGORY,
        label: 'Go to Last Edit Location'
    };
    /**
     * Command that clears the editor navigation history.
     */
    export const CLEAR_EDITOR_HISTORY: Command = {
        id: 'textEditor.commands.clear.history',
        category: EDITOR_CATEGORY,
        label: 'Clear Editor History'
    };
}

@injectable()
export class EditorCommandContribution implements CommandContribution {

    public static readonly AUTOSAVE_PREFERENCE: string = 'editor.autoSave';

    @inject(PreferenceService)
    protected readonly preferencesService: PreferenceService;

    @inject(QuickPickService)
    protected readonly quickPick: QuickPickService;

    @inject(LabelProvider)
    protected readonly labelProvider: LabelProvider;

    @inject(Languages)
    protected readonly languages: Languages;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(EditorCommands.SHOW_REFERENCES);
        registry.registerCommand(EditorCommands.CONFIG_INDENTATION);
        registry.registerCommand(EditorCommands.CONFIG_EOL);
        registry.registerCommand(EditorCommands.INDENT_USING_SPACES);
        registry.registerCommand(EditorCommands.INDENT_USING_TABS);
        registry.registerCommand(EditorCommands.CHANGE_LANGUAGE, {
            isEnabled: () => this.canConfigureLanguage(),
            isVisible: () => this.canConfigureLanguage(),
            execute: () => this.configureLanguage()
        });

        registry.registerCommand(EditorCommands.GO_BACK);
        registry.registerCommand(EditorCommands.GO_FORWARD);
        registry.registerCommand(EditorCommands.GO_LAST_EDIT);
        registry.registerCommand(EditorCommands.CLEAR_EDITOR_HISTORY);

        registry.registerCommand(CommonCommands.AUTO_SAVE, {
            isToggled: () => this.isAutoSaveOn(),
            execute: () => this.toggleAutoSave()
        });
    }

    protected canConfigureLanguage(): boolean {
        const widget = this.editorManager.currentEditor;
        const editor = widget && widget.editor;
        return !!editor && !!this.languages.languages;
    }
    protected async configureLanguage(): Promise<void> {
        const widget = this.editorManager.currentEditor;
        const editor = widget && widget.editor;
        if (!editor || !this.languages.languages) {
            return;
        }
        const current = editor.document.languageId;
        const items: QuickPickItem<'autoDetect' | Language>[] = [
            { label: 'Auto Detect', value: 'autoDetect' },
            { type: 'separator', label: 'languages (identifier)' },
            ... (await Promise.all(this.languages.languages.map(
                language => this.toQuickPickLanguage(language, current)
            ))).sort((e, e2) => e.label.localeCompare(e2.label))
        ];
        const selected = await this.quickPick.show(items, {
            placeholder: 'Select Language Mode'
        });
        if (selected === 'autoDetect') {
            editor.detectLanguage();
        } else if (selected) {
            editor.setLanguage(selected.id);
        }
    }
    protected async toQuickPickLanguage(value: Language, current: string): Promise<QuickPickValue<Language>> {
        const languageUri = this.toLanguageUri(value);
        const iconClass = await this.labelProvider.getIcon(languageUri) + ' file-icon';
        return {
            value,
            label: value.name,
            description: `(${value.id})${current === value.id ? ' - Configured Language' : ''}`,
            iconClass
        };
    }
    protected toLanguageUri(language: Language): URI {
        const extension = language.extensions.values().next();
        if (extension.value) {
            return new URI('file:///' + extension.value);
        }
        const filename = language.filenames.values().next();
        if (filename.value) {
            return new URI('file:///' + filename.value);
        }
        return new URI('file:///.txt');
    }

    private isAutoSaveOn(): boolean {
        const autoSave = this.preferencesService.get(EditorCommandContribution.AUTOSAVE_PREFERENCE);
        return autoSave === 'on' || autoSave === undefined;
    }
    private async toggleAutoSave(): Promise<void> {
        this.preferencesService.set(EditorCommandContribution.AUTOSAVE_PREFERENCE, this.isAutoSaveOn() ? 'off' : 'on');
    }
}

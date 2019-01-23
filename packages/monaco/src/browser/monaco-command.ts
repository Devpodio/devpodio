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

import { injectable, inject } from 'inversify';
import { ProtocolToMonacoConverter } from 'monaco-languageclient/lib';
import { Position, Location } from '@devpodio/languages/lib/browser';
import { Command, CommandContribution } from '@devpodio/core';
import { CommonCommands } from '@devpodio/core/lib/browser';
import { QuickOpenService } from '@devpodio/core/lib/browser/quick-open/quick-open-service';
import { QuickOpenItem, QuickOpenMode } from '@devpodio/core/lib/browser/quick-open/quick-open-model';
import { EditorCommands } from '@devpodio/editor/lib/browser';
import { MonacoEditor } from './monaco-editor';
import { MonacoCommandRegistry, MonacoEditorCommandHandler } from './monaco-command-registry';
import MenuRegistry = monaco.actions.MenuRegistry;
import MenuId = monaco.actions.MenuId;

export type MonacoCommand = Command & { delegate?: string };
export namespace MonacoCommands {

    export const UNDO = 'undo';
    export const REDO = 'redo';
    export const COMMON_KEYBOARD_ACTIONS = new Set([UNDO, REDO]);
    export const COMMON_ACTIONS: {
        [action: string]: string
    } = {};
    COMMON_ACTIONS[UNDO] = CommonCommands.UNDO.id;
    COMMON_ACTIONS[REDO] = CommonCommands.REDO.id;
    COMMON_ACTIONS['actions.find'] = CommonCommands.FIND.id;
    COMMON_ACTIONS['editor.action.startFindReplaceAction'] = CommonCommands.REPLACE.id;

    export const SELECTION_SELECT_ALL = 'editor.action.select.all';
    export const SELECTION_EXPAND_SELECTION = 'editor.action.smartSelect.grow';
    export const SELECTION_SHRINK_SELECTION = 'editor.action.smartSelect.shrink';

    export const SELECTION_COPY_LINE_UP = 'editor.action.copyLinesUpAction';
    export const SELECTION_COPY_LINE_DOWN = 'editor.action.copyLinesDownAction';
    export const SELECTION_MOVE_LINE_UP = 'editor.action.moveLinesUpAction';
    export const SELECTION_MOVE_LINE_DOWN = 'editor.action.moveLinesDownAction';

    export const SELECTION_ADD_CURSOR_ABOVE = 'editor.action.insertCursorAbove';
    export const SELECTION_ADD_CURSOR_BELOW = 'editor.action.insertCursorBelow';
    export const SELECTION_ADD_CURSOR_TO_LINE_END = 'editor.action.insertCursorAtEndOfEachLineSelected';
    export const SELECTION_ADD_NEXT_OCCURRENCE = 'editor.action.addSelectionToNextFindMatch';
    export const SELECTION_ADD_PREVIOUS_OCCURRENCE = 'editor.action.addSelectionToPreviousFindMatch';
    export const SELECTION_SELECT_ALL_OCCURRENCES = 'editor.action.selectHighlights';

    export const ACTIONS: MonacoCommand[] = [
        { id: SELECTION_SELECT_ALL, label: 'Select All', delegate: 'editor.action.selectAll' }
    ];
    export const EXCLUDE_ACTIONS = new Set([
        ...Object.keys(COMMON_ACTIONS),
        'editor.action.quickCommand',
        'editor.action.clipboardCutAction',
        'editor.action.clipboardCopyAction',
        'editor.action.clipboardPasteAction',
        'editor.action.goToImplementation',
        'editor.action.toggleTabFocusMode',
        'find.history.showNext',
        'find.history.showPrevious',
    ]);
    const iconClasses = new Map<string, string>();
    for (const menuItem of MenuRegistry.getMenuItems(MenuId.EditorContext)) {
        if (menuItem.command.iconClass) {
            iconClasses.set(menuItem.command.id, menuItem.command.iconClass);
        }
    }
    for (const command of monaco.editorExtensions.EditorExtensionsRegistry.getEditorActions()) {
        const id = command.id;
        if (!EXCLUDE_ACTIONS.has(id)) {
            const label = command.label;
            const iconClass = iconClasses.get(id);
            ACTIONS.push({ id, label, iconClass });
        }
    }
}

@injectable()
export class MonacoEditorCommandHandlers implements CommandContribution {

    @inject(MonacoCommandRegistry)
    protected readonly registry: MonacoCommandRegistry;

    @inject(ProtocolToMonacoConverter)
    protected readonly p2m: ProtocolToMonacoConverter;

    @inject(QuickOpenService)
    protected readonly quickOpenService: QuickOpenService;

    registerCommands(): void {
        this.registerCommonCommandHandlers();
        this.registerEditorCommandHandlers();
        this.registerMonacoActionCommands();
    }

    protected registerCommonCommandHandlers(): void {
        // tslint:disable-next-line:forin
        for (const action in MonacoCommands.COMMON_ACTIONS) {
            const command = MonacoCommands.COMMON_ACTIONS[action];
            const handler = this.newCommonActionHandler(action);
            this.registry.registerHandler(command, handler);
        }
    }
    protected newCommonActionHandler(action: string): MonacoEditorCommandHandler {
        return this.isCommonKeyboardAction(action) ? this.newKeyboardHandler(action) : this.newActionHandler(action);
    }
    protected isCommonKeyboardAction(action: string): boolean {
        return MonacoCommands.COMMON_KEYBOARD_ACTIONS.has(action);
    }

    protected registerEditorCommandHandlers(): void {
        this.registry.registerHandler(EditorCommands.SHOW_REFERENCES.id, this.newShowReferenceHandler());
        this.registry.registerHandler(EditorCommands.CONFIG_INDENTATION.id, this.newConfigIndentationHandler());
        this.registry.registerHandler(EditorCommands.CONFIG_EOL.id, this.newConfigEolHandler());
        this.registry.registerHandler(EditorCommands.INDENT_USING_SPACES.id, this.newConfigTabSizeHandler(true));
        this.registry.registerHandler(EditorCommands.INDENT_USING_TABS.id, this.newConfigTabSizeHandler(false));
    }

    protected newShowReferenceHandler(): MonacoEditorCommandHandler {
        return {
            execute: (editor: MonacoEditor, uri: string, position: Position, locations: Location[]) => {
                editor.commandService.executeCommand(
                    'editor.action.showReferences',
                    monaco.Uri.parse(uri),
                    this.p2m.asPosition(position),
                    locations.map(l => this.p2m.asLocation(l))
                );
            }
        };
    }

    protected newConfigIndentationHandler(): MonacoEditorCommandHandler {
        return {
            execute: editor => this.configureIndentation(editor)
        };
    }
    protected configureIndentation(editor: MonacoEditor): void {
        const options = [true, false].map(useSpaces =>
            new QuickOpenItem({
                label: `Indent Using ${useSpaces ? 'Spaces' : 'Tabs'}`,
                run: (mode: QuickOpenMode) => {
                    if (mode === QuickOpenMode.OPEN) {
                        this.configureTabSize(editor, useSpaces);
                    }
                    return false;
                }
            })
        );
        this.quickOpenService.open({ onType: (_, acceptor) => acceptor(options) }, {
            placeholder: 'Select Action',
            fuzzyMatchLabel: true
        });
    }

    protected newConfigEolHandler(): MonacoEditorCommandHandler {
        return {
            execute: editor => this.configureEol(editor)
        };
    }

    protected configureEol(editor: MonacoEditor): void {
        const options = ['LF', 'CRLF'].map(lineEnding =>
            new QuickOpenItem({
                label: lineEnding,
                run: (mode: QuickOpenMode) => {
                    if (mode === QuickOpenMode.OPEN) {
                        this.setEol(editor, lineEnding);
                        return true;
                    }
                    return false;
                }
            })
        );
        this.quickOpenService.open({ onType: (_, acceptor) => acceptor(options) }, {
            placeholder: 'Select End of Line Sequence',
            fuzzyMatchLabel: true
        });
    }

    protected setEol(editor: MonacoEditor, lineEnding: string): void {
        const model = editor.document && editor.document.textEditorModel;
        if (model) {
            if (lineEnding === 'CRLF' || lineEnding === '\r\n') {
                model.pushEOL(monaco.editor.EndOfLineSequence.CRLF);
            } else {
                model.pushEOL(monaco.editor.EndOfLineSequence.LF);
            }
        }
    }

    protected newConfigTabSizeHandler(useSpaces: boolean): MonacoEditorCommandHandler {
        return {
            execute: editor => this.configureTabSize(editor, useSpaces)
        };
    }
    protected configureTabSize(editor: MonacoEditor, useSpaces: boolean): void {
        const model = editor.document && editor.document.textEditorModel;
        if (model) {
            const { tabSize } = model.getOptions();
            const sizes = Array.from(Array(8), (_, x) => x + 1);
            const tabSizeOptions = sizes.map(size =>
                new QuickOpenItem({
                    label: size === tabSize ? `${size}   Configured Tab Size` : size.toString(),
                    run: (mode: QuickOpenMode) => {
                        if (mode !== QuickOpenMode.OPEN) {
                            return false;
                        }
                        model.updateOptions({
                            tabSize: size || tabSize,
                            insertSpaces: useSpaces
                        });
                        return true;
                    }
                })
            );
            this.quickOpenService.open({ onType: (_, acceptor) => acceptor(tabSizeOptions) }, {
                placeholder: 'Select Tab Size for Current File',
                fuzzyMatchLabel: true,
                selectIndex: lookFor => {
                    if (!lookFor || lookFor === '') {
                        return tabSize - 1;
                    }
                    return 0;
                }
            });
        }
    }

    protected registerMonacoActionCommands(): void {
        for (const action of MonacoCommands.ACTIONS) {
            const handler = this.newMonacoActionHandler(action);
            this.registry.registerCommand(action, handler);
        }
    }
    protected newMonacoActionHandler(action: MonacoCommand): MonacoEditorCommandHandler {
        const delegate = action.delegate;
        return delegate ? this.newCommandHandler(delegate) : this.newActionHandler(action.id);
    }

    protected newKeyboardHandler(action: string): MonacoEditorCommandHandler {
        return {
            execute: (editor, ...args) => editor.getControl().cursor.trigger('keyboard', action, args)
        };
    }
    protected newCommandHandler(action: string): MonacoEditorCommandHandler {
        return {
            execute: (editor, ...args) => editor.commandService.executeCommand(action, ...args)
        };
    }
    protected newActionHandler(action: string): MonacoEditorCommandHandler {
        return {
            execute: editor => editor.runAction(action),
            isEnabled: editor => editor.isActionSupported(action)
        };
    }

}

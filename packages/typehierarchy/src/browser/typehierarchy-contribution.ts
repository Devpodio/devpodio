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

import { injectable, inject, named } from 'inversify';
import { MenuModelRegistry } from '@theia/core/lib/common/menu';
import { ApplicationShell } from '@theia/core/lib/browser/shell';
import { KeybindingRegistry } from '@theia/core/lib/browser/keybinding';
import { Command, CommandRegistry } from '@theia/core/lib/common/command';
import { EDITOR_CONTEXT_MENU } from '@theia/editor/lib/browser/editor-menu';
import { EditorAccess } from '@theia/editor/lib/browser/editor-manager';
import { TypeHierarchyType } from '@theia/languages/lib/browser/typehierarchy/typehierarchy-feature';
import { AbstractViewContribution, OpenViewArguments } from '@theia/core/lib/browser/shell/view-contribution';
import { TypeHierarchyTree } from './tree/typehierarchy-tree';
import { TypeHierarchyTreeWidget } from './tree/typehierarchy-tree-widget';
import { TypeHierarchyService } from './typehierarchy-service';

@injectable()
export class TypeHierarchyContribution extends AbstractViewContribution<TypeHierarchyTreeWidget> {

    @inject(EditorAccess)
    @named(EditorAccess.CURRENT)
    protected readonly editorAccess: EditorAccess;

    @inject(TypeHierarchyService)
    protected readonly typeHierarchyService: TypeHierarchyService;

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    constructor() {
        super({
            widgetId: TypeHierarchyTreeWidget.WIDGET_ID,
            widgetName: TypeHierarchyTreeWidget.WIDGET_LABEL,
            defaultWidgetOptions: {
                area: 'bottom'
            },
            toggleCommandId: TypeHierarchyCommands.TOGGLE_VIEW.id,
            toggleKeybinding: 'ctrlcmd+alt+a'
        });
    }

    async openView(args?: Partial<TypeHierarchyOpenViewArguments>): Promise<TypeHierarchyTreeWidget> {
        const widget = await super.openView(args);
        const { selection, languageId } = this.editorAccess;
        const type = this.getType(args);
        await widget.initialize({ location: selection, languageId, type });
        return widget;
    }

    registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(TypeHierarchyCommands.OPEN_SUBTYPE, {
            execute: () => this.openViewOrFlipHierarchyDirection(TypeHierarchyType.SUBTYPE),
            isEnabled: this.isEnabled.bind(this)
        });
        commands.registerCommand(TypeHierarchyCommands.OPEN_SUPERTYPE, {
            execute: () => this.openViewOrFlipHierarchyDirection(TypeHierarchyType.SUPERTYPE),
            isEnabled: this.isEnabled.bind(this)
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        const menuPath = [...EDITOR_CONTEXT_MENU, 'type-hierarchy'];
        menus.registerMenuAction(menuPath, {
            commandId: TypeHierarchyCommands.OPEN_SUBTYPE.id
        });
        menus.registerMenuAction(menuPath, {
            commandId: TypeHierarchyCommands.OPEN_SUPERTYPE.id
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        super.registerKeybindings(keybindings);
        keybindings.registerKeybinding({
            command: TypeHierarchyCommands.OPEN_SUBTYPE.id,
            keybinding: 'ctrlcmd+alt+h'
        });
    }

    /**
     * Flips the hierarchy direction in the `Type Hierarchy` view, if it is active and has a valid root.
     * Otherwise, calculates the type hierarchy based on the selection of the current editor.
     */
    protected async openViewOrFlipHierarchyDirection(type: TypeHierarchyType): Promise<void> {
        if (this.isEnabled()) {
            const { activeWidget } = this.shell;
            if (activeWidget instanceof TypeHierarchyTreeWidget && TypeHierarchyTree.RootNode.is(activeWidget.model.root)) {
                await activeWidget.model.flipDirection();
            } else {
                await this.openView({
                    toggle: false,
                    activate: true,
                    type
                });
            }
        }
    }

    /**
     * `true` if the super- and subtype hierarchy support is enabled.
     * Enabled if:
     *  - the current text editor supports super- and subtype hierarchies.
     *  - the `Type Hierarchy` view is the active one and it has an input.
     */
    protected isEnabled(languageId: string | undefined = this.editorAccess.languageId): boolean {
        if (this.typeHierarchyService.isEnabledFor(languageId)) {
            return true;
        }
        const { activeWidget } = this.shell;
        return activeWidget instanceof TypeHierarchyTreeWidget;
    }

    /**
     * Extracts the type hierarchy type from the argument. If the hierarchy type cannot be extracted, returns with the `subtype` as the default type.
     */
    protected getType(args?: Partial<TypeHierarchyOpenViewArguments>): TypeHierarchyType {
        return !!args && !!args.type ? args.type : TypeHierarchyType.SUBTYPE;
    }

}

export interface TypeHierarchyOpenViewArguments extends OpenViewArguments {

    /**
     * The type hierarchy type for the view argument.
     */
    readonly type: TypeHierarchyType;

}

export namespace TypeHierarchyCommands {

    export const TOGGLE_VIEW: Command = {
        id: 'typehierarchy:toggle'
    };

    export const OPEN_SUBTYPE: Command = {
        id: 'typehierarchy:open-subtype',
        label: 'Subtype Hierarchy'
    };

    export const OPEN_SUPERTYPE: Command = {
        id: 'typehierarchy:open-supertype',
        label: 'Supertype Hierarchy'
    };

}

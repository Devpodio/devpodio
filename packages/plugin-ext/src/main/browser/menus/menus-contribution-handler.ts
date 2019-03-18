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

// tslint:disable:no-any

import { injectable, inject } from 'inversify';
import { MenuPath, ILogger, CommandRegistry, Command, Mutable, MenuAction, SelectionService, UriSelection } from '@theia/core';
import { EDITOR_CONTEXT_MENU, EditorWidget } from '@theia/editor/lib/browser';
import { MenuModelRegistry } from '@theia/core/lib/common';
import { TabBarToolbarRegistry, TabBarToolbarItem } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { QuickCommandService } from '@theia/core/lib/browser/quick-open/quick-command-service';
import { VIEW_ITEM_CONTEXT_MENU } from '../view/tree-views-main';
import { PluginContribution, Menu } from '../../../common';
import { DebugStackFramesWidget } from '@theia/debug/lib/browser/view/debug-stack-frames-widget';
import { DebugThreadsWidget } from '@theia/debug/lib/browser/view/debug-threads-widget';

@injectable()
export class MenusContributionPointHandler {

    @inject(MenuModelRegistry)
    protected readonly menuRegistry: MenuModelRegistry;

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(ILogger)
    protected readonly logger: ILogger;

    @inject(QuickCommandService)
    protected readonly quickCommandService: QuickCommandService;

    @inject(TabBarToolbarRegistry)
    protected readonly tabBarToolbar: TabBarToolbarRegistry;

    @inject(SelectionService)
    protected readonly selectionService: SelectionService;

    handle(contributions: PluginContribution): void {
        const allMenus = contributions.menus;
        if (!allMenus) {
            return;
        }
        for (const location in allMenus) {
            if (location === 'commandPalette') {
                for (const menu of allMenus[location]) {
                    if (menu.when) {
                        this.quickCommandService.pushCommandContext(menu.command, menu.when);
                    }
                }
            } else if (location === 'editor/title') {
                for (const action of allMenus[location]) {
                    this.registerEditorTitleAction(action);
                }
            } else if (allMenus.hasOwnProperty(location)) {
                const menuPaths = MenusContributionPointHandler.parseMenuPaths(location);
                if (!menuPaths.length) {
                    this.logger.warn(`Plugin contributes items to a menu with invalid identifier: ${location}`);
                    continue;
                }
                const menus = allMenus[location];
                menus.forEach(menu => {
                    for (const menuPath of menuPaths) {
                        this.registerMenuAction(menuPath, menu);
                    }
                });
            }
        }
    }

    protected registerEditorTitleAction(action: Menu): void {
        const id = this.createSyntheticCommandId(action, { prefix: '__plugin.editor.title.action.' });
        const command: Command = { id };
        this.commands.registerCommand(command, {
            execute: widget => widget instanceof EditorWidget && this.commands.executeCommand(action.command, widget.editor.uri['codeUri']),
            isEnabled: widget => widget instanceof EditorWidget && this.commands.isEnabled(action.command, widget.editor.uri['codeUri']),
            isVisible: widget => widget instanceof EditorWidget && this.commands.isVisible(action.command, widget.editor.uri['codeUri'])
        });

        const { group, when } = action;
        const item: Mutable<TabBarToolbarItem> = { id, command: id, group, when };
        this.tabBarToolbar.registerItem(item);

        this.onDidRegisterCommand(action.command, pluginCommand => {
            command.iconClass = pluginCommand.iconClass;
            item.tooltip = pluginCommand.label;
        });
    }

    protected static parseMenuPaths(value: string): MenuPath[] {
        switch (value) {
            case 'editor/context': return [EDITOR_CONTEXT_MENU];
            case 'explorer/context': return [NAVIGATOR_CONTEXT_MENU];
            case 'view/item/context': return [VIEW_ITEM_CONTEXT_MENU];
            case 'debug/callstack/context': return [DebugStackFramesWidget.CONTEXT_MENU, DebugThreadsWidget.CONTEXT_MENU];
        }
        return [];
    }

    protected registerMenuAction(menuPath: MenuPath, menu: Menu): void {
        const commandId = this.createSyntheticCommandId(menu, { prefix: '__plugin.menu.action.' });
        const command: Command = { id: commandId };
        const selectedResource = () => {
            const selection = this.selectionService.selection;
            const uri = UriSelection.getUri(selection);
            return uri ? uri['codeUri'] : (typeof selection !== 'object' && typeof selection !== 'function') ? selection : undefined;
        };
        this.commands.registerCommand(command, {
            execute: () => this.commands.executeCommand(menu.command, selectedResource()),
            isEnabled: () => this.commands.isEnabled(menu.command, selectedResource()),
            isVisible: () => this.commands.isVisible(menu.command, selectedResource())
        });

        const { when } = menu;
        const [group = '', order = undefined] = (menu.group || '').split('@');
        const action: MenuAction = { commandId, order, when };
        this.menuRegistry.registerMenuAction([...menuPath, group], action);

        this.onDidRegisterCommand(menu.command, pluginCommand => {
            command.category = pluginCommand.category;
            action.label = pluginCommand.label;
            action.icon = pluginCommand.iconClass;
        });
    }

    protected createSyntheticCommandId(menu: Menu, { prefix }: { prefix: string }): string {
        const command = menu.command;
        let id = prefix + command;
        let index = 0;
        while (this.commands.getCommand(id)) {
            id = prefix + command + ':' + index;
            index++;
        }
        return id;
    }

    protected onDidRegisterCommand(id: string, cb: (command: Command) => void): void {
        const command = this.commands.getCommand(id);
        if (command) {
            cb(command);
        } else {
            // Registering a menu action requires the related command to be already registered.
            // But Theia plugin registers the commands dynamically via the Commands API.
            // Let's wait for ~2 sec. It should be enough to finish registering all the contributed commands.
            // FIXME: remove this workaround (timer) once the https://github.com/theia-ide/theia/issues/3344 is fixed
            setTimeout(() => this.onDidRegisterCommand(id, cb), 2000);
        }
    }

}

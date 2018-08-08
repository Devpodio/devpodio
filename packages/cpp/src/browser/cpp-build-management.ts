/********************************************************************************
 * Copyright (C) 2018 Ericsson
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
import { MAIN_MENU_BAR, MenuContribution, MenuModelRegistry, CommandContribution, CommandRegistry, MessageService } from '@theia/core/lib/common';
import { QuickOpenService, QuickOpenMode, KeybindingContribution, KeybindingRegistry } from '@theia/core/lib/browser';
import { CppBuildConfigurationManager, CppBuildConfiguration, CppBuildConfigurationPicker, CPP_CHANGE_BUILD_CONFIGURATION } from './cpp-build-configurations';
import { CppBuildCommands } from './cpp-build-management-commands';

export namespace CppBuildMenus {
    export const BUILD = [...MAIN_MENU_BAR, '3_build'];
    export const BUILD_MENUS = [...BUILD, '1_build_menus'];
    export const BUILD_CONFIGURATIONS = [...BUILD, '2_build_configurations'];
    export const BUILD_TARGETS = [...BUILD, '3_build_targets'];
}

@injectable()
export class CppBuildConfigurationBuilder extends CppBuildConfigurationPicker {

    protected activeMarker = ' (active)';

    @inject(MessageService) protected readonly messageService: MessageService;

    guessBuildCommand(config: CppBuildConfiguration): string {
        throw new Error('TODO');
    }

    build(config: CppBuildConfiguration): boolean {
        if (!config.command) {
            try {
                config.command = this.guessBuildCommand(config);
            } catch (error) {
                this.messageService.error(error.message);
                return false;
            }
        }
        this.messageService.log(`${config.name}: ${config.directory}\n command: ${config.command}`);
        return true;
    }

    protected itemAction(mode: QuickOpenMode, config?: CppBuildConfiguration): boolean {
        if (mode === QuickOpenMode.OPEN && config) {
            this.build(config);
            return true;
        }
        return false;
    }

}

@injectable()
export class CppBuildManagementContribution implements CommandContribution, MenuContribution, KeybindingContribution {

    @inject(CppBuildConfigurationManager) protected readonly buildConfigManager: CppBuildConfigurationManager;
    @inject(CppBuildConfigurationBuilder) protected readonly builder: CppBuildConfigurationBuilder;
    @inject(QuickOpenService) protected readonly quickOpenService: QuickOpenService;
    @inject(MessageService) protected readonly messageService: MessageService;

    registerCommands(registry: CommandRegistry) {
        registry.registerCommand(CppBuildCommands.BUILD_CURRENT, {
            isEnabled: () => !!this.buildConfigManager.getActiveConfig(),
            execute: () => {
                const config = this.buildConfigManager.getActiveConfig();
                this.builder.build(config!);
            },
        });
        registry.registerCommand(CppBuildCommands.BUILD_CONFIGURATION, {
            isEnabled: () => this.buildConfigManager.getConfigs().length > 0,
            execute: () => {
                this.builder.open();
            },
        });
    }

    registerMenus(registry: MenuModelRegistry) {
        registry.registerSubmenu(CppBuildMenus.BUILD, 'Build (C/C++)');

        registry.registerMenuAction(CppBuildMenus.BUILD_MENUS, {
            commandId: CppBuildCommands.BUILD_CURRENT.id,
            order: '0',
        });
        registry.registerMenuAction(CppBuildMenus.BUILD_MENUS, {
            commandId: CppBuildCommands.BUILD_CONFIGURATION.id,
            order: '1',
        });
        registry.registerMenuAction(CppBuildMenus.BUILD_CONFIGURATIONS, {
            commandId: CPP_CHANGE_BUILD_CONFIGURATION.id,
        });
    }

    registerKeybindings(registry: KeybindingRegistry) {
        registry.registerKeybindings(
            {
                command: CppBuildCommands.BUILD_CURRENT.id,
                keybinding: 'shift+f4',
            },
        );
    }
}

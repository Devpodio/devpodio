/*
 * Copyright (C) 2015-2018 Red Hat, Inc.
 * All rights reserved. This program and the accompanying materials
 * are made available under the terms of the Eclipse Public License v1.0
 * which accompanies this distribution, and is available at
 * http://www.eclipse.org/legal/epl-v10.html
 *
 * Contributors:
 *   Red Hat, Inc. - initial API and implementation
 */

import { injectable, inject } from 'inversify';
import { Command, CommandRegistry, CommandContribution } from '@theia/core/lib/common';
import { KeybindingRegistry, KeybindingContribution } from '@theia/core/lib/browser';
import { HostedPluginClient } from './hosted-plugin-client';

export namespace HostedPluginCommands {
    export const RUN: Command = {
        id: 'hosted-plugin:run',
        label: 'Hosted Plugin: Run'
    };
    export const TERMINATE: Command = {
        id: 'hosted-plugin:terminate',
        label: 'Hosted Plugin: Terminate Instance'
    };
    export const SELECT_PLUGIN_PATH: Command = {
        id: 'hosted-plugin:select-path',
        label: 'Hosted Plugin: Select Path'
    };
}

@injectable()
export class PluginApiFrontendContribution implements CommandContribution, KeybindingContribution {

    @inject(HostedPluginClient)
    protected readonly hostedPluginClient: HostedPluginClient;

    registerCommands(commands: CommandRegistry): void {
        commands.registerCommand(HostedPluginCommands.RUN, {
            execute: () => this.hostedPluginClient.run()
        });
        commands.registerCommand(HostedPluginCommands.TERMINATE, {
            execute: () => this.hostedPluginClient.terminate()
        });
        commands.registerCommand(HostedPluginCommands.SELECT_PLUGIN_PATH, {
            execute: () => this.hostedPluginClient.selectPluginPath()
        });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({
            command: HostedPluginCommands.RUN.id,
            keybinding: "f5"
        });
    }

}

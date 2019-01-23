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
import { UUID } from '@phosphor/coreutils/lib/uuid';
import { Terminal, TerminalOptions } from '@devpodio/plugin';
import { TerminalServiceExt, TerminalServiceMain, PLUGIN_RPC_CONTEXT } from '../api/plugin-api';
import { RPCProtocol } from '../api/rpc-protocol';
import { Emitter } from '@devpodio/core/lib/common/event';
import { Deferred } from '@devpodio/core/lib/common/promise-util';
import * as theia from '@devpodio/plugin';

/**
 * Provides high level terminal plugin api to use in the Theia plugins.
 * This service allow(with help proxy) create and use terminal emulator.
 */
export class TerminalServiceExtImpl implements TerminalServiceExt {

    private readonly proxy: TerminalServiceMain;

    private readonly _terminals = new Map<string, TerminalExtImpl>();

    private readonly onDidCloseTerminalEmitter = new Emitter<Terminal>();
    readonly onDidCloseTerminal: theia.Event<Terminal> = this.onDidCloseTerminalEmitter.event;

    private readonly onDidOpenTerminalEmitter = new Emitter<Terminal>();
    readonly onDidOpenTerminal: theia.Event<Terminal> = this.onDidOpenTerminalEmitter.event;

    private readonly onDidChangeActiveTerminalEmitter = new Emitter<Terminal | undefined>();
    readonly onDidChangeActiveTerminal: theia.Event<Terminal | undefined> = this.onDidChangeActiveTerminalEmitter.event;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.TERMINAL_MAIN);
    }

    get terminals(): TerminalExtImpl[] {
        return [...this._terminals.values()];
    }

    createTerminal(nameOrOptions: TerminalOptions | (string | undefined), shellPath?: string, shellArgs?: string[]): Terminal {
        let options: TerminalOptions;
        if (typeof nameOrOptions === 'object') {
            options = nameOrOptions;
        } else {
            options = {
                name: nameOrOptions,
                shellPath: shellPath,
                shellArgs: shellArgs
            };
        }
        const id = `plugin-terminal-${UUID.uuid4()}`;
        this.proxy.$createTerminal(id, options);
        return this.obtainTerminal(id, options.name || 'Terminal');
    }

    protected obtainTerminal(id: string, name: string): TerminalExtImpl {
        let terminal = this._terminals.get(id);
        if (!terminal) {
            terminal = new TerminalExtImpl(this.proxy);
            this._terminals.set(id, terminal);
        }
        terminal.name = name;
        return terminal;
    }

    $terminalCreated(id: string, name: string): void {
        const terminal = this.obtainTerminal(id, name);
        terminal.id.resolve(id);
        this.onDidOpenTerminalEmitter.fire(terminal);
    }

    $terminalNameChanged(id: string, name: string): void {
        const terminal = this._terminals.get(id);
        if (terminal) {
            terminal.name = name;
        }
    }

    $terminalOpened(id: string, processId: number): void {
        const terminal = this._terminals.get(id);
        if (terminal) {
            // resolve for existing clients
            terminal.deferredProcessId.resolve(processId);
            // install new if terminal is reconnected
            terminal.deferredProcessId = new Deferred<number>();
            terminal.deferredProcessId.resolve(processId);
        }
    }

    $terminalClosed(id: string): void {
        const terminal = this._terminals.get(id);
        if (terminal) {
            this.onDidCloseTerminalEmitter.fire(terminal);
            this._terminals.delete(id);
        }
    }

    private activeTerminalId: string | undefined;
    get activeTerminal(): TerminalExtImpl | undefined {
        return this.activeTerminalId && this._terminals.get(this.activeTerminalId) || undefined;
    }
    $currentTerminalChanged(id: string | undefined): void {
        this.activeTerminalId = id;
        this.onDidChangeActiveTerminalEmitter.fire(this.activeTerminal);
    }

}

export class TerminalExtImpl implements Terminal {

    name: string;

    readonly id = new Deferred<string>();

    deferredProcessId = new Deferred<number>();
    get processId(): Thenable<number> {
        return this.deferredProcessId.promise;
    }

    constructor(private readonly proxy: TerminalServiceMain) { }

    sendText(text: string, addNewLine: boolean = true): void {
        this.id.promise.then(id => this.proxy.$sendText(id, text, addNewLine));
    }

    show(preserveFocus?: boolean): void {
        this.id.promise.then(id => this.proxy.$show(id, preserveFocus));
    }

    hide(): void {
        this.id.promise.then(id => this.proxy.$hide(id));
    }

    dispose(): void {
        this.id.promise.then(id => this.proxy.$dispose(id));
    }

}

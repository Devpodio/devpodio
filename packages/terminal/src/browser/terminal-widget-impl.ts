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

import * as Xterm from 'xterm';
import { proposeGeometry } from 'xterm/lib/addons/fit/fit';
import { inject, injectable, named, postConstruct } from 'inversify';
import { Disposable, Event, Emitter, ILogger, DisposableCollection } from '@devpodio/core';
import { Widget, Message, WebSocketConnectionProvider, StatefulWidget, isFirefox, MessageLoop, KeyCode } from '@devpodio/core/lib/browser';
import { isOSX } from '@devpodio/core/lib/common';
import { WorkspaceService } from '@devpodio/workspace/lib/browser';
import { ShellTerminalServerProxy } from '../common/shell-terminal-protocol';
import { terminalsPath } from '../common/terminal-protocol';
import { IBaseTerminalServer } from '../common/base-terminal-protocol';
import { TerminalWatcher } from '../common/terminal-watcher';
import { ThemeService } from '@devpodio/core/lib/browser/theming';
import { TerminalWidgetOptions, TerminalWidget } from './base/terminal-widget';
import { MessageConnection } from 'vscode-jsonrpc';
import { Deferred } from '@devpodio/core/lib/common/promise-util';
import { TerminalPreferences } from './terminal-preferences';

export const TERMINAL_WIDGET_FACTORY_ID = 'terminal';

export interface TerminalWidgetFactoryOptions extends Partial<TerminalWidgetOptions> {
    /* a unique string per terminal */
    created: string
}

interface TerminalCSSProperties {
    /* The font family (e.g. monospace).  */
    fontFamily: string;

    /* The font size, in number of px.  */
    fontSize: number;

    /* The text color, as a CSS color string.  */
    termTheme: object;
}

@injectable()
export class TerminalWidgetImpl extends TerminalWidget implements StatefulWidget {

    private readonly TERMINAL = 'Terminal';
    protected readonly onTermDidClose = new Emitter<TerminalWidget>();
    protected terminalId = -1;
    protected term: Xterm.Terminal;
    protected restored = false;
    protected closeOnDispose = true;
    protected waitForConnection: Deferred<MessageConnection> | undefined;

    @inject(WorkspaceService) protected readonly workspaceService: WorkspaceService;
    @inject(WebSocketConnectionProvider) protected readonly webSocketConnectionProvider: WebSocketConnectionProvider;
    @inject(TerminalWidgetOptions) options: TerminalWidgetOptions;
    @inject(ShellTerminalServerProxy) protected readonly shellTerminalServer: ShellTerminalServerProxy;
    @inject(TerminalWatcher) protected readonly terminalWatcher: TerminalWatcher;
    @inject(ThemeService) protected readonly themeService: ThemeService;
    @inject(ILogger) @named('terminal') protected readonly logger: ILogger;
    @inject('terminal-dom-id') public readonly id: string;
    @inject(TerminalPreferences) protected readonly preferences: TerminalPreferences;

    protected readonly onDidOpenEmitter = new Emitter<void>();
    readonly onDidOpen: Event<void> = this.onDidOpenEmitter.event;

    protected readonly toDisposeOnConnect = new DisposableCollection();

    @postConstruct()
    protected init(): void {
        this.title.caption = this.options.title || this.TERMINAL;
        this.title.label = this.options.title || this.TERMINAL;
        this.title.iconClass = 'fa fa-terminal';

        if (this.options.destroyTermOnClose === true) {
            this.toDispose.push(Disposable.create(() =>
                this.term.dispose()
            ));
        }

        this.title.closable = true;
        this.addClass('terminal-container');

        /* Read CSS properties from the page and apply them to the terminal.  */
        const cssProps = this.getCSSPropertiesFromPage();

        this.term = new Xterm.Terminal({
            experimentalCharAtlas: 'dynamic',
            cursorBlink: false,
            fontFamily: cssProps.fontFamily,
            fontSize: cssProps.fontSize,
            theme: cssProps.termTheme,
        });

        this.toDispose.push(this.themeService.onThemeChange(() => {
            const changedProps = this.getCSSPropertiesFromPage();
            this.term.setOption('theme', changedProps.termTheme);
        }));
        this.attachCustomKeyEventHandler();
        this.term.on('title', (title: string) => {
            if (this.options.useServerTitle) {
                this.title.label = title;
            }
        });

        this.toDispose.push(this.terminalWatcher.onTerminalError(({ terminalId, error }) => {
            if (terminalId === this.terminalId) {
                this.dispose();
                this.onTermDidClose.fire(this);
                this.onTermDidClose.dispose();
                this.logger.error(`The terminal process terminated. Cause: ${error}`);
            }
        }));
        this.toDispose.push(this.terminalWatcher.onTerminalExit(({ terminalId }) => {
            if (terminalId === this.terminalId) {
                this.dispose();
                this.onTermDidClose.fire(this);
                this.onTermDidClose.dispose();
            }
        }));
        this.toDispose.push(this.toDisposeOnConnect);
        this.toDispose.push(this.shellTerminalServer.onDidCloseConnection(() => {
            const disposable = this.shellTerminalServer.onDidOpenConnection(() => {
                disposable.dispose();
                this.reconnectTerminalProcess();
            });
            this.toDispose.push(disposable);
        }));
        this.toDispose.push(this.onTermDidClose);
        this.toDispose.push(this.onDidOpenEmitter);
    }

    get processId(): Promise<number> {
        return (async () => {
            if (!IBaseTerminalServer.validateId(this.terminalId)) {
                throw new Error('terminal is not started');
            }
            return this.shellTerminalServer.getProcessId(this.terminalId);
        })();
    }

    clearOutput(): void {
        this.term.clear();
    }

    storeState(): object {
        this.closeOnDispose = false;
        return { terminalId: this.terminalId, titleLabel: this.title.label };
    }

    restoreState(oldState: object) {
        if (this.restored === false) {
            const state = oldState as { terminalId: number, titleLabel: string };
            /* This is a workaround to issue #879 */
            this.restored = true;
            this.title.label = state.titleLabel;
            this.start(state.terminalId);
        }
    }

    /* Get the font family and size from the CSS custom properties defined in
       the root element.  */
    private getCSSPropertiesFromPage(): TerminalCSSProperties {
        /* Helper to look up a CSS property value and throw an error if it's
           not defined.  */
        function lookup(props: CSSStyleDeclaration, name: string): string {
            /* There is sometimes an extra space in the front, remove it.  */
            const value = props.getPropertyValue(name).trim();
            if (!value) {
                throw new Error(`Couldn\'t find value of ${name}`);
            }

            return value;
        }

        /* Get the CSS properties of <html> (aka :root in css).  */
        const htmlElementProps = getComputedStyle(document.documentElement!);

        const fontFamily = lookup(htmlElementProps, '--theia-terminal-font-family');
        const fontSizeStr = lookup(htmlElementProps, '--theia-code-font-size');
        const foreground = lookup(htmlElementProps, '--theia-terminal-foreground');
        const background = lookup(htmlElementProps, '--theia-terminal-background');
        const cursor = lookup(htmlElementProps, '--theia-terminal-cursor');
        const cursorAccent = lookup(htmlElementProps, '--theia-terminal-cursorAccent');
        const selection = lookup(htmlElementProps, '--theia-terminal-selection');
        const black = lookup(htmlElementProps, '--theia-terminal-black');
        const red = lookup(htmlElementProps, '--theia-terminal-red');
        const green = lookup(htmlElementProps, '--theia-terminal-green');
        const yellow = lookup(htmlElementProps, '--theia-terminal-yellow');
        const blue = lookup(htmlElementProps, '--theia-terminal-blue');
        const magenta = lookup(htmlElementProps, '--theia-terminal-magenta');
        const cyan = lookup(htmlElementProps, '--theia-terminal-cyan');
        const white = lookup(htmlElementProps, '--theia-terminal-white');
        const brightBlack = lookup(htmlElementProps, '--theia-terminal-brightBlack');
        const brightRed = lookup(htmlElementProps, '--theia-terminal-brightRed');
        const brightGreen = lookup(htmlElementProps, '--theia-terminal-brightGreen');
        const brightYellow = lookup(htmlElementProps, '--theia-terminal-brightYellow');
        const brightBlue = lookup(htmlElementProps, '--theia-terminal-brightBlue');
        const brightMagenta = lookup(htmlElementProps, '--theia-terminal-brightMagenta');
        const brightCyan = lookup(htmlElementProps, '--theia-terminal-brightCyan');
        const brightWhite = lookup(htmlElementProps, '--theia-terminal-brightWhite');
        /* The font size is returned as a string, such as ' 13px').  We want to
           return just the number of px.  */
        const fontSizeMatch = fontSizeStr.trim().match(/^(\d+)px$/);
        if (!fontSizeMatch) {
            throw new Error(`Unexpected format for --theia-code-font-size (${fontSizeStr})`);
        }

        const fontSize = Number.parseInt(fontSizeMatch[1]);

        /* xterm.js expects #XXX of #XXXXXX for colors.  */
        const colorRe = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

        if (!foreground.match(colorRe)) {
            throw new Error(`Unexpected format for --theia-ui-font-color1 (${foreground})`);
        }

        if (!background.match(colorRe)) {
            throw new Error(`Unexpected format for --theia-layout-color0 (${background})`);
        }

        return {
            fontSize, fontFamily, termTheme: {
                foreground, background, cursor, cursorAccent,
                selection, black, red, green, yellow, blue, magenta, cyan, white, brightBlack,
                brightRed, brightGreen, brightYellow, brightBlue, brightMagenta, brightCyan, brightWhite
            }
        };
    }

    /**
     * Create a new shell terminal in the back-end and attach it to a
     * new terminal widget.
     * If id is provided attach to the terminal for this id.
     */
    async start(id?: number): Promise<number> {
        this.terminalId = typeof id !== 'number' ? await this.createTerminal() : await this.attachTerminal(id);
        this.resizeTerminalProcess();
        this.connectTerminalProcess();
        if (IBaseTerminalServer.validateId(this.terminalId)) {
            this.onDidOpenEmitter.fire(undefined);
            return this.terminalId;
        }
        throw new Error('Failed to start terminal' + (id ? ` for id: ${id}.` : '.'));
    }

    protected async attachTerminal(id: number): Promise<number> {
        const terminalId = await this.shellTerminalServer.attach(id);
        if (IBaseTerminalServer.validateId(terminalId)) {
            return terminalId;
        }
        this.logger.error(`Error attaching to terminal id ${id}, the terminal is most likely gone. Starting up a new terminal instead.`);
        return this.createTerminal();
    }

    protected async createTerminal(): Promise<number> {
        let rootURI = this.options.cwd;
        if (!rootURI) {
            const root = (await this.workspaceService.roots)[0];
            rootURI = root && root.uri;
        }
        const { cols, rows } = this.term;

        const terminalId = await this.shellTerminalServer.create({
            shell: this.options.shellPath,
            args: this.options.shellArgs,
            env: this.options.env,
            rootURI,
            cols,
            rows
        });
        if (IBaseTerminalServer.validateId(terminalId)) {
            return terminalId;
        }
        throw new Error('Error creating terminal widget, see the backend error log for more information.');
    }

    processMessage(msg: Message): void {
        super.processMessage(msg);
        switch (msg.type) {
            case 'fit-request':
                this.onFitRequest();
                break;
            default:
                break;
        }
    }
    protected onFitRequest(): void {
        MessageLoop.sendMessage(this, Widget.ResizeMessage.UnknownSize);
    }
    protected onActivateRequest(): void {
        this.term.focus();
    }
    protected onAfterShow(): void {
        this.update();
    }
    protected onAfterAttach(): void {
        this.update();
    }
    protected onResize(): void {
        this.needsResize = true;
        this.update();
    }

    protected needsResize = true;
    protected onUpdateRequest(msg: Message): void {
        super.onUpdateRequest(msg);
        if (!this.isVisible || !this.isAttached) {
            return;
        }

        this.open();

        if (this.needsResize) {
            this.resizeTerminal();
            this.needsResize = false;

            this.resizeTerminalProcess();
        }
    }

    protected connectTerminalProcess(): void {
        if (typeof this.terminalId !== 'number') {
            return;
        }
        this.toDisposeOnConnect.dispose();
        this.toDispose.push(this.toDisposeOnConnect);
        this.term.reset();
        const waitForConnection = this.waitForConnection = new Deferred<MessageConnection>();
        this.webSocketConnectionProvider.listen({
            path: `${terminalsPath}/${this.terminalId}`,
            onConnection: connection => {
                connection.onNotification('onData', (data: string) => this.write(data));

                const sendData = (data?: string) => data && connection.sendRequest('write', data);
                this.term.on('data', sendData);
                connection.onDispose(() => this.term.off('data', sendData));

                this.toDisposeOnConnect.push(connection);
                connection.listen();
                if (waitForConnection) {
                    waitForConnection.resolve(connection);
                }
            }
        }, { reconnecting: false });
    }
    protected async reconnectTerminalProcess(): Promise<void> {
        if (typeof this.terminalId === 'number') {
            await this.start(this.terminalId);
        }
    }

    protected termOpened = false;
    protected initialData = '';
    protected open(): void {
        if (this.termOpened) {
            return;
        }
        this.term.open(this.node);
        if (this.initialData) {
            this.term.write(this.initialData);
        }
        this.termOpened = true;
        this.initialData = '';

        if (isFirefox) {
            // The software scrollbars don't work with xterm.js, so we disable the scrollbar if we are on firefox.
            (this.term.element.children.item(0) as HTMLElement).style.overflow = 'hidden';
        }
    }
    protected write(data: string): void {
        if (this.termOpened) {
            this.term.write(data);
        } else {
            this.initialData += data;
        }
    }

    sendText(text: string): void {
        if (this.waitForConnection) {
            this.waitForConnection.promise.then(connection =>
                connection.sendRequest('write', text)
            );
        }
    }

    get onTerminalDidClose(): Event<TerminalWidget> {
        return this.onTermDidClose.event;
    }

    dispose(): void {
        /* Close the backend terminal only when explicitly closing the terminal
         * a refresh for example won't close it.  */
        if (this.closeOnDispose === true && typeof this.terminalId === 'number') {
            this.shellTerminalServer.close(this.terminalId);
            this.onTermDidClose.fire(this);
            this.onTermDidClose.dispose();
        }
        super.dispose();
    }

    protected resizeTerminal(): void {
        const geo = proposeGeometry(this.term);
        const cols = geo.cols;
        const rows = geo.rows - 1; // subtract one row for margin
        this.term.resize(cols, rows);
    }

    protected resizeTerminalProcess(): void {
        if (typeof this.terminalId !== 'number') {
            return;
        }
        const { cols, rows } = this.term;
        this.shellTerminalServer.resize(this.terminalId, cols, rows);
    }

    protected get enableCopy(): boolean {
        return this.preferences['terminal.enableCopy'];
    }

    protected get enablePaste(): boolean {
        return this.preferences['terminal.enablePaste'];
    }

    protected customKeyHandler(event: KeyboardEvent): boolean {
        const keyBindings = KeyCode.createKeyCode(event).toString();
        const ctrlCmdCopy = (isOSX && keyBindings === 'meta+c') || (!isOSX && keyBindings === 'ctrl+c');
        const ctrlCmdPaste = (isOSX && keyBindings === 'meta+v') || (!isOSX && keyBindings === 'ctrl+v');
        if (ctrlCmdCopy && this.enableCopy && this.term.hasSelection()) {
            return false;
        }
        if (ctrlCmdPaste && this.enablePaste) {
            return false;
        }
        return true;
    }
    protected attachCustomKeyEventHandler(): void {
        this.term.attachCustomKeyEventHandler(e => this.customKeyHandler(e));
    }

}

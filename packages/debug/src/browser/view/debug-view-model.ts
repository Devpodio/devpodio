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

import { injectable, inject, postConstruct } from 'inversify';
import { Disposable, DisposableCollection, Event, Emitter } from '@devpodio/core/lib/common';
import URI from '@devpodio/core/lib/common/uri';
import { DebugSession, DebugState } from '../debug-session';
import { DebugSessionManager } from '../debug-session-manager';
import { DebugThread } from '../model/debug-thread';
import { DebugStackFrame } from '../model/debug-stack-frame';
import { DebugBreakpoint } from '../model/debug-breakpoint';

export const DebugViewOptions = Symbol('DebugViewOptions');
export interface DebugViewOptions {
    session?: DebugSession
}

@injectable()
export class DebugViewModel implements Disposable {

    protected readonly onDidChangeEmitter = new Emitter<void>();
    readonly onDidChange: Event<void> = this.onDidChangeEmitter.event;
    protected fireDidChange(): void {
        this.onDidChangeEmitter.fire(undefined);
    }

    protected readonly onDidChangeBreakpointsEmitter = new Emitter<URI>();
    readonly onDidChangeBreakpoints: Event<URI> = this.onDidChangeBreakpointsEmitter.event;
    protected fireDidChangeBreakpoints(uri: URI): void {
        this.onDidChangeBreakpointsEmitter.fire(uri);
    }

    protected readonly toDispose = new DisposableCollection(
        this.onDidChangeEmitter,
        this.onDidChangeBreakpointsEmitter
    );

    @inject(DebugViewOptions)
    protected readonly options: DebugViewOptions;

    @inject(DebugSessionManager)
    protected readonly manager: DebugSessionManager;

    protected readonly _sessions = new Set<DebugSession>();
    get sessions(): IterableIterator<DebugSession> {
        return this._sessions.values();
    }
    get sessionCount(): number {
        return this._sessions.size;
    }
    push(session: DebugSession): void {
        if (this._sessions.has(session)) {
            return;
        }
        this._sessions.add(session);
        this.fireDidChange();
    }
    delete(session: DebugSession): boolean {
        if (this._sessions.delete(session)) {
            this.fireDidChange();
            return true;
        }
        return false;
    }

    get session(): DebugSession | undefined {
        return this.sessions.next().value;
    }
    get id(): string {
        return this.session && this.session.id || '-1';
    }
    get label(): string {
        return this.session && this.session.label || 'Unknown Session';
    }
    has(session: DebugSession | undefined): session is DebugSession {
        return !!session && this._sessions.has(session);
    }

    @postConstruct()
    protected init(): void {
        if (this.options.session) {
            this.push(this.options.session);
        }
        this.toDispose.push(this.manager.onDidChangeActiveDebugSession(({ previous, current }) => {
            if (this.has(previous) && !this.has(current)) {
                this.fireDidChange();
            }
        }));
        this.toDispose.push(this.manager.onDidChange(current => {
            if (this.has(current)) {
                this.fireDidChange();
            }
        }));
        this.toDispose.push(this.manager.onDidChangeBreakpoints(({ session, uri }) => {
            if (!session || session === this.currentSession) {
                this.fireDidChangeBreakpoints(uri);
            }
        }));
    }

    dispose(): void {
        this.toDispose.dispose();
    }

    get currentSession(): DebugSession | undefined {
        const { currentSession } = this.manager;
        return this.has(currentSession) && currentSession || this.session;
    }
    set currentSession(currentSession: DebugSession | undefined) {
        this.manager.currentSession = currentSession;
    }

    get state(): DebugState {
        const { currentSession } = this;
        return currentSession && currentSession.state || DebugState.Inactive;
    }
    get currentThread(): DebugThread | undefined {
        const { currentSession } = this;
        return currentSession && currentSession.currentThread;
    }
    get currentFrame(): DebugStackFrame | undefined {
        const { currentThread } = this;
        return currentThread && currentThread.currentFrame;
    }

    get breakpoints(): DebugBreakpoint[] {
        return this.manager.getBreakpoints(this.currentSession);
    }

    async start(): Promise<void> {
        const { session } = this;
        if (!session) {
            return;
        }
        const newSession = await this.manager.start(session.options);
        if (newSession) {
            this._sessions.delete(session);
            this._sessions.add(newSession);
            this.fireDidChange();
        }
    }

    async restart(): Promise<void> {
        const { session } = this;
        if (!session) {
            return;
        }
        const newSession = await this.manager.restart(session);
        if (newSession !== session) {
            this._sessions.delete(session);
            this._sessions.add(newSession);
        }
        this.fireDidChange();
    }

}

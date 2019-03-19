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

import { PLUGIN_RPC_CONTEXT, StatusBarExt, StatusBarMessageRegistryMain } from '../api/plugin-api';
import { CancellationToken, Progress, ProgressOptions } from '@devpodio/plugin';
import { RPCProtocol } from '../api/rpc-protocol';
import { Event, Emitter } from '@devpodio/core/lib/common/event';
import { Disposable, DisposableCollection } from '@devpodio/core/lib/common/disposable';
import { StatusBarItemImpl } from './status-bar/status-bar-item';

export class StatusBarExtImpl implements StatusBarExt {
    private readonly proxy: StatusBarMessageRegistryMain;

    private readonly onCancelEmitter: Emitter<void> = new Emitter<void>();
    async withProgress<R>(
        options: ProgressOptions,
        task: (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => PromiseLike<R>
    ): Promise<R> {
        const message = options.title ? '$(refresh~spin) ' + options.title : '';
        const id = StatusBarItemImpl.nextId();
        this.proxy.$setMessage(id, message, 1, 1, undefined, undefined, undefined);
        return this.createProgress(id, message, task);
    }

    private createProgress<R>(
        id: string,
        message: string,
        task: (progress: Progress<{ message?: string; increment?: number }>, token: CancellationToken) => PromiseLike<R>): PromiseLike<R> {

        const token = new CancellationTokenImpl(this.onCancel);
        const progressEnd = (handler: string): void => {
            this.proxy.$dispose(handler);
            token.dispose();
        };

        let progress: PromiseLike<R>;

        try {
            progress = task(new ProgressCallback(id, message, this.proxy), token);
        } catch (err) {
            progressEnd(id);
            throw err;
        }

        progress.then(() => progressEnd(id), () => progressEnd(id));
        return progress;
    }

    private readonly onCancel: Event<void> = this.onCancelEmitter.event;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(PLUGIN_RPC_CONTEXT.STATUS_BAR_MESSAGE_REGISTRY_MAIN);
    }
}

class ProgressCallback<T> implements Progress<{ message?: string, increment?: number }> {

    private readonly id: string;
    private readonly message: string;
    private readonly proxy: StatusBarMessageRegistryMain;

    constructor(id: string, message: string, proxy: StatusBarMessageRegistryMain) {
        this.id = id;
        this.message = message;
        this.proxy = proxy;
    }
    report(item: { message?: string, increment?: number }) {
        this.proxy.$update(this.id, this.message + (item.message ? ': ' + ' ' + item.message : ''));
    }
}

class CancellationTokenImpl implements CancellationToken, Disposable {

    private readonly disposableCollection = new DisposableCollection();
    private readonly onCancellationRequestedEmitter: Emitter<void> = new Emitter<void>();

    isCancellationRequested: boolean = false;
    readonly onCancellationRequested: Event<void> = this.onCancellationRequestedEmitter.event;

    constructor(oncCancel: Event<void>) {
        this.disposableCollection.push(oncCancel(() => {
            this.onCancellationRequestedEmitter.fire(undefined);
            this.isCancellationRequested = true;
            this.dispose();
        }));
    }

    dispose(): void {
        this.disposableCollection.dispose();
    }
}

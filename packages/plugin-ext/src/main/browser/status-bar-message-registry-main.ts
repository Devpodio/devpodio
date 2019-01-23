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
import {interfaces} from 'inversify';
import * as types from '../../plugin/types-impl';
import {StatusBarMessageRegistryMain} from '../../api/plugin-api';
import { StatusBar, StatusBarAlignment, StatusBarEntry } from '@devpodio/core/lib/browser/status-bar/status-bar';

const STATUS_BAR_MESSAGE_PRE = 'status-bar-entry';

export class StatusBarMessageRegistryMainImpl implements StatusBarMessageRegistryMain {
    private delegate: StatusBar;

    private entries: Map<string, StatusBarEntry> = new Map();

    constructor(container: interfaces.Container) {
        this.delegate = container.get(StatusBar);
    }

    $setMessage(text: string | undefined,
                priority: number,
                alignment: number,
                color: string | undefined,
                tooltip: string | undefined,
                command: string | undefined): PromiseLike<string> {
        const id = this.uniqueId;
        const entry = {
            text: text || '',
            priority,
            alignment: alignment === types.StatusBarAlignment.Left ? StatusBarAlignment.LEFT : StatusBarAlignment.RIGHT,
            color,
            tooltip,
            command
        };

        this.entries.set(id, entry);
        return this.delegate.setElement(id, entry).then(() => Promise.resolve(id));
    }

    $update(id: string, message: string): void {
        const entry = this.entries.get(id);
        if (entry) {
            entry.text = message;
            this.delegate.setElement(id, entry);
        }
    }

    $dispose(id: string): void {
        this.delegate.removeElement(id).then(() => {
            this.entries.delete(id);
        });
    }

    private get uniqueId(): string {
        let extensionId = STATUS_BAR_MESSAGE_PRE;
        for (let counter = 0; counter < 100; counter++) {
            extensionId = `${STATUS_BAR_MESSAGE_PRE}_id_${('0000' + (Math.random() * Math.pow(36, 4) << 0).toString(36)).slice(-4)}`;
            if (!this.entries.get(extensionId)) {
                break;
            }
        }
        return extensionId;
    }
}

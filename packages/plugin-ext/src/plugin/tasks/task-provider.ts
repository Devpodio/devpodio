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

import * as theia from '@devpodio/plugin';
import * as Converter from '../type-converters';
import { ObjectIdentifier } from '../../common/object-identifier';
import { createToken } from '../token-provider';
import { TaskDto } from '../../common';

export class TaskProviderAdapter {
    private cacheId = 0;
    private cache = new Map<number, theia.Task>();

    constructor(private readonly provider: theia.TaskProvider) { }

    provideTasks(): Promise<TaskDto[] | undefined> {
        return Promise.resolve(this.provider.provideTasks(createToken())).then(tasks => {
            if (!Array.isArray(tasks)) {
                return undefined;
            }
            const result: TaskDto[] = [];
            for (const task of tasks) {
                const data = Converter.fromTask(task);
                if (!data) {
                    continue;
                }

                const id = this.cacheId++;
                ObjectIdentifier.mixin(data, id);
                this.cache.set(id, task);
                result.push(data);
            }
            return result;
        });
    }

    resolveTask(task: TaskDto): Promise<TaskDto | undefined> {
        if (typeof this.provider.resolveTask !== 'function') {
            return Promise.resolve(undefined);
        }
        const id = ObjectIdentifier.of(task);
        const cached = this.cache.get(id);
        const item = cached ? cached : Converter.toTask(task);
        if (!item) {
            return Promise.resolve(undefined);
        }

        return Promise.resolve(this.provider.resolveTask(item, createToken())).then(value => {
            if (value) {
                return Converter.fromTask(value);
            }
            return undefined;
        });
    }
}

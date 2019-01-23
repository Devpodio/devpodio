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

import { injectable } from 'inversify';
import { MaybePromise } from '@devpodio/core/lib/common/types';
import { MessageType } from '@devpodio/core/lib/common/message-service-protocol';
import { TreeSource, TreeElement, CompositeTreeElement } from '@devpodio/core/lib/browser/source-tree';

export interface ConsoleItem extends TreeElement {
    readonly severity?: MessageType
}
export namespace ConsoleItem {
    export const errorClassName = 'theia-console-error';
    export const warningClassName = 'theia-console-warning';
    export const infoClassName = 'theia-console-info';
    export const logClassName = 'theia-console-log';
}

export interface CompositeConsoleItem extends ConsoleItem, CompositeTreeElement {
    getElements(): MaybePromise<IterableIterator<ConsoleItem>>
}

@injectable()
export abstract class ConsoleSession extends TreeSource {
    abstract getElements(): MaybePromise<IterableIterator<ConsoleItem>>;
    abstract execute(value: string): MaybePromise<void>;
    abstract clear(): MaybePromise<void>;
}

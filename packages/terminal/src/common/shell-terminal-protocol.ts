/********************************************************************************
 * Copyright (C) 2017 Ericsson and others.
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

import { JsonRpcProxy } from '@devpodio/core';
import { IBaseTerminalServer, IBaseTerminalServerOptions } from './base-terminal-protocol';

export const IShellTerminalServer = Symbol('IShellTerminalServer');

export interface IShellTerminalServer extends IBaseTerminalServer {
}

export const shellTerminalPath = '/services/shell-terminal';

export interface IShellTerminalServerOptions extends IBaseTerminalServerOptions {
    shell?: string,
    args?: string[],
    rootURI?: string,
    cols?: number,
    rows?: number,
    env?: { [key: string]: string | null };
}

export const ShellTerminalServerProxy = Symbol('ShellTerminalServerProxy');
export type ShellTerminalServerProxy = JsonRpcProxy<IShellTerminalServer>;

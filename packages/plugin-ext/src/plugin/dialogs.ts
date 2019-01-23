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
import { PLUGIN_RPC_CONTEXT as Ext, OpenDialogOptionsMain, DialogsMain, SaveDialogOptionsMain } from '../api/plugin-api';
import { OpenDialogOptions, SaveDialogOptions } from '@devpodio/plugin';
import { RPCProtocol } from '../api/rpc-protocol';
import Uri from 'vscode-uri';

export class DialogsExtImpl {
    private proxy: DialogsMain;

    constructor(rpc: RPCProtocol) {
        this.proxy = rpc.getProxy(Ext.DIALOGS_MAIN);
    }

    showOpenDialog(options: OpenDialogOptions): PromiseLike<Uri[] | undefined> {
        const optionsMain = {
            openLabel: options.openLabel,
            defaultUri: options.defaultUri ? options.defaultUri.path : undefined,
            canSelectFiles: options.canSelectFiles,
            canSelectFolders: options.canSelectFolders,
            canSelectMany: options.canSelectMany,
            filters: options.filters
        } as OpenDialogOptionsMain;

        return new Promise((resolve, reject) => {
            this.proxy.$showOpenDialog(optionsMain).then(result => {
                if (result) {
                    const uris = [];
                    for (let i = 0; i < result.length; i++) {
                        const uri = Uri.parse('file://' + result[i]);
                        uris.push(uri);
                    }
                    resolve(uris);
                } else {
                    resolve(undefined);
                }
            }).catch(reason => {
                reject(reason);
            });
        });
    }

    showSaveDialog(options: SaveDialogOptions): PromiseLike<Uri | undefined> {
        const optionsMain = {
            saveLabel: options.saveLabel,
            defaultUri: options.defaultUri ? options.defaultUri.path : undefined,
            filters: options.filters
        } as SaveDialogOptionsMain;

        return new Promise((resolve, reject) => {
            this.proxy.$showSaveDialog(optionsMain).then(result => {
                if (result) {
                    resolve(Uri.parse('file://' + result));
                } else {
                    resolve(undefined);
                }
            }).catch(reason => {
                reject(reason);
            });
        });
    }

}

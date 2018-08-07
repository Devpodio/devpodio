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

import { interfaces } from 'inversify';
import { WorkspaceExt, MAIN_RPC_CONTEXT, WorkspaceMain, WorkspaceFolderPickOptionsMain } from '../../api/plugin-api';
import { RPCProtocol } from '../../api/rpc-protocol';
import { WorkspaceService } from '@theia/workspace/lib/browser';
import Uri from 'vscode-uri';
import { WorkspaceFoldersChangeEvent, WorkspaceFolder } from '@theia/plugin';
import { Path } from '@theia/core/lib/common/path';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode } from '@theia/core/lib/browser/quick-open/quick-open-model';
import { MonacoQuickOpenService } from '@theia/monaco/lib/browser/monaco-quick-open-service';

export class WorkspaceMainImpl implements WorkspaceMain {

    private proxy: WorkspaceExt;

    private workspaceService: WorkspaceService;
    private quickOpenService: MonacoQuickOpenService;

    private workspaceRoot: Uri | undefined;

    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.WORKSPACE_EXT);
        this.workspaceService = container.get(WorkspaceService);
        this.quickOpenService = container.get(MonacoQuickOpenService);

        this.workspaceService.root.then(root => {
            if (root) {
                this.workspaceRoot = Uri.parse(root.uri);
                const workspacePath = new Path(this.workspaceRoot.path);

                const folder: WorkspaceFolder = {
                    uri: this.workspaceRoot,
                    name: workspacePath.base,
                    index: 0
                } as WorkspaceFolder;

                this.proxy.$onWorkspaceFoldersChanged({
                    added: [folder],
                    removed: []
                } as WorkspaceFoldersChangeEvent);
            } else {
                this.proxy.$onWorkspaceFoldersChanged({
                    added: [],
                    removed: []
                } as WorkspaceFoldersChangeEvent);
            }
        });
    }

    $pickWorkspaceFolder(options: WorkspaceFolderPickOptionsMain): Promise<WorkspaceFolder | undefined> {
        return new Promise((resolve, reject) => {
            // Return undeinfed if workspace root is not set
            if (!this.workspaceRoot) {
                resolve(undefined);
                return;
            }

            // Active before appearing the pick menu
            const activeElement: HTMLElement | undefined = window.document.activeElement as HTMLElement;

            // WorkspaceFolder to be returned
            let returnValue: WorkspaceFolder | undefined;

            // Take workspace root
            const root = this.workspaceRoot;
            const rootPathName = root.path.substring(root.path.lastIndexOf('/') + 1);

            // Fill items
            const items: QuickOpenItem[] = [];
            items.push(new QuickOpenItem({
                label: rootPathName,
                detail: root.path,
                run: mode => {
                    if (mode === QuickOpenMode.OPEN) {
                        returnValue = {
                            uri: Uri.parse(root.toString()),
                            name: rootPathName,
                            index: 0
                        } as WorkspaceFolder;
                    }
                    return true;
                }
            }));

            // Create quick open model
            const model = {
                onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
                    acceptor(items);
                }
            } as QuickOpenModel;

            // Show pick menu
            this.quickOpenService.open(model, {
                fuzzyMatchLabel: true,
                fuzzyMatchDetail: true,
                fuzzyMatchDescription: true,
                placeholder: options.placeHolder,
                onClose: () => {
                    if (activeElement) {
                        activeElement.focus();
                    }

                    resolve(returnValue);
                }
            });
        });
    }

}

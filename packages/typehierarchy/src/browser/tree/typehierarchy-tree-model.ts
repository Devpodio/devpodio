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

import { inject, injectable } from 'inversify';
import { TreeNode } from '@theia/core/lib/browser/tree/tree';
import { TreeModelImpl } from '@theia/core/lib/browser/tree/tree-model';
import { Location } from '@theia/editor/lib/browser/editor';
import { DocumentSymbolExt } from '@theia/languages/lib/browser/typehierarchy/typehierarchy-protocol';
import { TypeHierarchyType } from '@theia/languages/lib/browser/typehierarchy/typehierarchy-feature';
import { TypeHierarchyService } from '../typehierarchy-service';
import { TypeHierarchyTree } from './typehierarchy-tree';

@injectable()
export class TypeHierarchyTreeModel extends TreeModelImpl {

    @inject(TypeHierarchyService)
    protected readonly typeHierarchyService: TypeHierarchyService;

    protected doOpenNode(node: TreeNode): void {
        // do nothing (in particular do not expand the node)
    }

    /**
     * Initializes the tree by calculating and setting a new tree root node.
     */
    async initialize(options: TypeHierarchyTree.InitOptions): Promise<void> {
        this.tree.root = undefined;
        const { location, languageId, type } = options;
        if (languageId && location) {
            const symbol = await this.symbol(languageId, type, location);
            if (symbol) {
                const root = TypeHierarchyTree.RootNode.create(symbol, languageId, type);
                root.expanded = true;
                this.tree.root = root;
            }
        }
    }

    /**
     * If the tree root is set, it resets it with the inverse type hierarchy direction.
     */
    async flipDirection(): Promise<void> {
        const { root } = this.tree;
        if (TypeHierarchyTree.RootNode.is(root)) {
            const { type, location, languageId } = root;
            this.initialize({
                type: TypeHierarchyType.flip(type),
                location,
                languageId
            });
        }
    }

    /**
     * Returns with the super- or subtypes for the argument.
     */
    protected async symbol(languageId: string, type: TypeHierarchyType, location: Location): Promise<DocumentSymbolExt | undefined> {
        switch (type) {
            case TypeHierarchyType.SUBTYPE: return this.typeHierarchyService.subTypes(languageId, location);
            case TypeHierarchyType.SUPERTYPE: return this.typeHierarchyService.superTypes(languageId, location);
            default: throw new Error(`Unexpected type hierarchy type: ${type}.`);
        }
    }

}

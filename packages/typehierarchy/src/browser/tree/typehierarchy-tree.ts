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
import { v4 } from 'uuid';
import URI from '@theia/core/lib/common/uri';
import { Location } from '@theia/editor/lib/browser/editor';
import { SymbolKind } from '@theia/languages/lib/browser';
import { TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import { TreeImpl, TreeNode, CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode } from '@theia/core/lib/browser/tree';
import { DocumentSymbolExt } from '@theia/languages/lib/browser/typehierarchy/typehierarchy-protocol';
import { TypeHierarchyType } from '@theia/languages/lib/browser/typehierarchy/typehierarchy-feature';
import { TypeHierarchyService } from '../typehierarchy-service';

@injectable()
export class TypeHierarchyTree extends TreeImpl {

    @inject(TypeHierarchyService)
    protected readonly typeHierarchyService: TypeHierarchyService;

    async resolveChildren(parent: CompositeTreeNode): Promise<TreeNode[]> {
        if (TypeHierarchyTree.Node.is(parent)) {
            await this.ensureResolved(parent);
            if (parent.children.length === 0) {
                delete parent.children;
                delete parent.expanded;
                return [];
            }
            return parent.children.slice();
        }
        return [];
    }

    /**
     * Extracts the language ID from the root node.
     */
    protected get languageId(): string | undefined {
        if (TypeHierarchyTree.RootNode.is(this.root)) {
            return this.root.languageId;
        }
        return undefined;
    }

    /**
     * Returns with the type hierarchy type attached to the root node. `undefined` if the root is not set.
     */
    protected get type(): TypeHierarchyType | undefined {
        if (TypeHierarchyTree.RootNode.is(this.root)) {
            return this.root.type;
        }
        return undefined;
    }

    /**
     * Makes sure, the node and its children are resolved. Resolves it on demand.
     */
    protected async ensureResolved(node: TypeHierarchyTree.Node): Promise<void> {
        if (!node.resolved) {
            const { languageId, type } = this;
            if (languageId && type) {
                const { location } = node;
                const resolvedSymbol = await (TypeHierarchyType.SUBTYPE === type
                    ? this.typeHierarchyService.subTypes(languageId, location)
                    : this.typeHierarchyService.superTypes(languageId, location));

                if (resolvedSymbol) {
                    node.resolved = true;
                    if (resolvedSymbol.children) {
                        node.children = resolvedSymbol.children.filter(DocumentSymbolExt.is).map(child => TypeHierarchyTree.Node.create(child, type));
                    } else {
                        node.children = [];
                    }
                }
            }
        }
    }

}

export namespace TypeHierarchyTree {

    export interface InitOptions {
        readonly type: TypeHierarchyType;
        readonly location: Location | undefined;
        readonly languageId: string | undefined;
    }

    export interface RootNode extends Node {
        readonly type: TypeHierarchyType;
        readonly languageId: string;
    }

    export namespace RootNode {

        export function is(node: TreeNode | undefined): node is RootNode {
            if (Node.is(node) && 'type' in node && 'languageId' in node) {
                // tslint:disable-next-line:no-any
                const { type, languageId } = (node as any);
                return typeof languageId === 'string' && (type === TypeHierarchyType.SUBTYPE || type === TypeHierarchyType.SUPERTYPE);
            }
            return false;
        }

        export function create(symbol: DocumentSymbolExt, languageId: string, type: TypeHierarchyType): RootNode {
            return {
                ...Node.create(symbol, type, true),
                type,
                languageId
            };
        }

    }

    export interface Node extends CompositeTreeNode, ExpandableTreeNode, SelectableTreeNode, TreeDecoration.DecoratedTreeNode {
        readonly location: Location;
        readonly kind: SymbolKind;
        resolved: boolean;
    }

    export namespace Node {

        export function is(node: TreeNode | undefined): node is Node {
            if (!!node && 'resolved' in node && 'location' in node && 'kind' in node) {
                // tslint:disable-next-line:no-any
                const { resolved, location, kind } = (node as any);
                return Location.is(location) && typeof resolved === 'boolean' && typeof kind === 'number';
            }
            return false;
        }

        export function create(symbol: DocumentSymbolExt, type: TypeHierarchyType, resolved: boolean = true): Node {
            const node = {
                id: v4(),
                name: symbol.name,
                description: symbol.detail,
                parent: undefined,
                location: Location.create(symbol.uri, symbol.selectionRange),
                resolved,
                children: symbol.children ? symbol.children.filter(DocumentSymbolExt.is).map(child => create(child, type, false)) : [],
                expanded: false,
                visible: true,
                selected: false,
                kind: symbol.kind,
                decorationData: decorationData(symbol, type)
            };
            // Trick: if the node is `resolved` and have zero `children`, make the node non-expandable.
            if (resolved && node.children.length === 0) {
                delete node.expanded;
            }
            return node;
        }

        function decorationData(symbol: DocumentSymbolExt, type: TypeHierarchyType): TreeDecoration.Data {
            const captionSuffixes: TreeDecoration.CaptionAffix[] = [{
                data: new URI(symbol.uri).displayName,
                fontData: {
                    color: 'var(--theia-ui-font-color2)',
                }
            }];
            if (symbol.detail) {
                captionSuffixes.unshift({
                    data: symbol.detail,
                    fontData: {
                        color: 'var(--theia-accent-color0)',
                        style: 'italic'
                    }
                });
            }
            const data = `${TypeHierarchyType.SUBTYPE === type ? '▼' : '▲'}`;
            const color = `var(${TypeHierarchyType.SUBTYPE === type ? '--theia-error-color2' : '--theia-success-color2'})`;
            return {
                captionSuffixes,
                captionPrefixes: [{
                    data,
                    fontData: {
                        color,
                        style: 'bold'
                    }
                }]
            };
        }

    }

}

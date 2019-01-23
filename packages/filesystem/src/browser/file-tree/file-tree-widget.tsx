/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import { injectable, inject } from 'inversify';
import { ContextMenuRenderer, NodeProps, TreeProps, TreeNode, TreeWidget } from '@devpodio/core/lib/browser';
import { DirNode, FileStatNode } from './file-tree';
import { FileTreeModel } from './file-tree-model';
import { DisposableCollection, Disposable } from '@devpodio/core/lib/common';
import { UriSelection } from '@devpodio/core/lib/common/selection';
import * as React from 'react';

export const FILE_TREE_CLASS = 'theia-FileTree';
export const FILE_STAT_NODE_CLASS = 'theia-FileStatNode';
export const DIR_NODE_CLASS = 'theia-DirNode';
export const FILE_STAT_ICON_CLASS = 'theia-FileStatIcon';

@injectable()
export class FileTreeWidget extends TreeWidget {

    protected readonly toCancelNodeExpansion = new DisposableCollection();

    constructor(
        @inject(TreeProps) readonly props: TreeProps,
        @inject(FileTreeModel) readonly model: FileTreeModel,
        @inject(ContextMenuRenderer) contextMenuRenderer: ContextMenuRenderer
    ) {
        super(props, model, contextMenuRenderer);
        this.addClass(FILE_TREE_CLASS);
        this.toDispose.push(this.toCancelNodeExpansion);
    }

    protected createNodeClassNames(node: TreeNode, props: NodeProps): string[] {
        const classNames = super.createNodeClassNames(node, props);
        if (FileStatNode.is(node)) {
            classNames.push(FILE_STAT_NODE_CLASS);
        }
        if (DirNode.is(node)) {
            classNames.push(DIR_NODE_CLASS);
        }
        return classNames;
    }

    protected renderIcon(node: TreeNode, props: NodeProps): React.ReactNode {
        if (FileStatNode.is(node)) {
            return <div className={(node.icon || '') + ' file-icon'}></div>;
        }
        // tslint:disable-next-line:no-null-keyword
        return null;
    }

    protected createContainerAttributes(): React.HTMLAttributes<HTMLElement> {
        const attrs = super.createContainerAttributes();
        return {
            ...attrs,
            onDragEnter: event => this.handleDragEnterEvent(this.model.root, event),
            onDragOver: event => this.handleDragOverEvent(this.model.root, event),
            onDragLeave: event => this.handleDragLeaveEvent(this.model.root, event),
            onDrop: event => this.handleDropEvent(this.model.root, event)
        };
    }

    protected createNodeAttributes(node: TreeNode, props: NodeProps): React.Attributes & React.HTMLAttributes<HTMLElement> {
        const elementAttrs = super.createNodeAttributes(node, props);
        return {
            ...elementAttrs,
            draggable: FileStatNode.is(node),
            onDragStart: event => this.handleDragStartEvent(node, event),
            onDragEnter: event => this.handleDragEnterEvent(node, event),
            onDragOver: event => this.handleDragOverEvent(node, event),
            onDragLeave: event => this.handleDragLeaveEvent(node, event),
            onDrop: event => this.handleDropEvent(node, event),
            title: this.getNodeTooltip(node)
        };
    }

    protected getNodeTooltip(node: TreeNode): string | undefined {
        const uri = UriSelection.getUri(node);
        return uri ? uri.path.toString() : undefined;
    }

    protected handleDragStartEvent(node: TreeNode, event: React.DragEvent): void {
        event.stopPropagation();
        this.setTreeNodeAsData(event.dataTransfer, node);
    }

    protected handleDragEnterEvent(node: TreeNode | undefined, event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.toCancelNodeExpansion.dispose();
        const containing = DirNode.getContainingDir(node);
        if (!!containing && !containing.selected) {
            this.model.selectNode(containing);
        }
    }

    protected handleDragOverEvent(node: TreeNode | undefined, event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        if (!this.toCancelNodeExpansion.disposed) {
            return;
        }
        const timer = setTimeout(() => {
            const containing = DirNode.getContainingDir(node);
            if (!!containing && !containing.expanded) {
                this.model.expandNode(containing);
            }
        }, 500);
        this.toCancelNodeExpansion.push(Disposable.create(() => clearTimeout(timer)));
    }

    protected handleDragLeaveEvent(node: TreeNode | undefined, event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        this.toCancelNodeExpansion.dispose();
    }

    protected handleDropEvent(node: TreeNode | undefined, event: React.DragEvent): void {
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = 'copy'; // Explicitly show this is a copy.
        const containing = DirNode.getContainingDir(node);
        if (containing) {
            const source = this.getTreeNodeFromData(event.dataTransfer);
            if (source) {
                this.model.move(source, containing);
            } else {
                this.model.upload(containing, event.dataTransfer.items);
            }
        }
    }

    protected setTreeNodeAsData(data: DataTransfer, node: TreeNode): void {
        data.setData('tree-node', node.id);
    }

    protected getTreeNodeFromData(data: DataTransfer): TreeNode | undefined {
        const id = data.getData('tree-node');
        return this.model.getNode(id);
    }

}

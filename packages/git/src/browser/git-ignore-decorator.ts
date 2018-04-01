/*
 * Copyright (C) 2018 TypeFox and others.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

import { inject, injectable, postConstruct } from 'inversify';
import URI from '@theia/core/lib/common/uri';
import { Tree, TreeNode } from '@theia/core/lib/browser/tree/tree';
import { DepthFirstTreeIterator } from '@theia/core/lib/browser/tree/tree-iterator';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { TreeDecoration } from '@theia/core/lib/browser/tree/tree-decorator';
import { GitUtils } from '../common/git';
import { GitDecorator } from './git-decorator';
import { FileSystem } from '@theia/filesystem/lib/common';
import { DirNode } from '@theia/filesystem/lib/browser';

@injectable()
export class GitIgnoreDecorator extends GitDecorator {

    readonly id = 'theia-git-ignore-decorator';

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(FileSystemWatcher)
    protected readonly fileSystemWatcher: FileSystemWatcher;

    @postConstruct()
    init(): void {
        super.init();
        this.toDispose.pushAll([
            this.fileSystemWatcher.onFilesChanged(changes => {
                if (changes.some(change => change.uri.toString().endsWith(GitUtils.GIT_IGNORE))) {
                    this.fireDidChangeDecorations(tree => this.collectDecorators(tree));
                }
            })
        ]);
    }

    protected async collectDecorators(tree: Tree): Promise<Map<string, TreeDecoration.Data>> {
        const { root } = tree;
        if (root === undefined || !this.enabled) {
            return new Map();
        }

        // const ignoresUris = new Set();
        const ignoresUris = await this.hack_collectIgnoredChildrenUris(root);
        // const prune = this.prune.bind(this);
        // for (const node of new DepthFirstTreeIterator(root, { pruneCollapsed: true, prune })) {
        //     if (DirNode.is(node)) {
        //         (await this.collectIgnoredChildrenUris(node, node === root)).forEach(uri => ignoresUris.add(uri));
        //     }
        // }

        return new Map(Array.from(ignoresUris).map(uri => [uri, { fontData: { color: 'red' } }] as [string, TreeDecoration.Data]));
    }

    protected prune(node: TreeNode): boolean {
        if (DirNode.is(node)) {
            const { id } = node;
            const { selectedRepository } = this.tracker;
            return selectedRepository === undefined || !selectedRepository.localUri.startsWith(id);
        }
        return true;
    }

    protected async hack_collectIgnoredChildrenUris(root: TreeNode): Promise<string[]> {
        const { git, selectedRepository } = this.tracker;
        if (selectedRepository === undefined) {
            return [];
        }
        const uri = new URI(root.id);
        const relativePath = this.tracker.getPath(uri);
        if (relativePath === undefined) {
            return [];
        }
        try {
            const { stdout } = await git.exec(selectedRepository, ['clean', '-ndX']);
            // We got back either directory paths (ending with /) if the whole content is ignored
            // or individual files.
            const paths = stdout.trim().split('Would remove ') || [];
            // Drop the first empty string (if any).
            paths.shift();
            const ignoredUris = new Set(paths.map(p => uri.resolve(p.trim()).toString()));
            if (ignoredUris.size === 0) {
                return [];
            }
            const visibleIgnoredUris = [];
            for (const node of new DepthFirstTreeIterator(root, { pruneCollapsed: true })) {
                const id = DirNode.is(node) ? `${node.id}/` : node.id;
                if (ignoredUris.has(id) || Array.from(ignoredUris).some(u => id.startsWith(u) && u.endsWith('/'))) {
                    // XXX use the original `node.id`.
                    visibleIgnoredUris.push(node.id);
                }
            }
            return visibleIgnoredUris;
        } catch (e) {
            this.logger.error(`Error occurred when collecting Git ignored resources for ${root.id}.`, e);
            return [];
        }
    }

    /**
     * Returns with the URI of children resources which are ignored by Git.
     *
     * If the `checkSelf` argument is `true`, this method must check whether the `node` itself is ignored by Git or not.
     * If so, the returning array must contain the URI of the `node`. This is required because the root does not have a parent,
     * still we want to decorate it if it is ignored by Git. Overriding methods should be aware of this.
     */
    protected async collectIgnoredChildrenUris(node: DirNode, checkSelf: boolean = false): Promise<string[]> {
        const { git, selectedRepository } = this.tracker;
        if (selectedRepository === undefined) {
            return [];
        }
        const relativePath = this.tracker.getPath(node.uri);
        if (relativePath === undefined) {
            return [];
        }
        try {
            const path = relativePath.length === 0 ? '*' : `${relativePath}/*`;
            const { stdout } = await git.exec(selectedRepository, ['check-ignore', path]);
            const paths = (stdout.trim().split('\n') || []).map(p => p.substr(relativePath.length));
            return paths.map(p => node.uri.resolve(p.trim()).toString());
        } catch (e) {
            this.logger.error(`Error occurred when collecting Git ignored resources for ${node.id}.`, e);
            return [];
        }
    }

}

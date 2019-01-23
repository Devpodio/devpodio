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

import { injectable, inject, postConstruct } from 'inversify';
import URI from '@devpodio/core/lib/common/uri';
import { CompositeTreeNode, TreeModelImpl, TreeNode, ConfirmDialog } from '@devpodio/core/lib/browser';
import { FileSystem } from '../../common';
import { FileSystemWatcher, FileChangeType, FileChange, FileMoveEvent } from '../filesystem-watcher';
import { FileStatNode, DirNode, FileNode } from './file-tree';
import { LocationService } from '../location';
import { LabelProvider } from '@devpodio/core/lib/browser/label-provider';
import * as base64 from 'base64-js';

@injectable()
export class FileTreeModel extends TreeModelImpl implements LocationService {

    @inject(LabelProvider) protected readonly labelProvider: LabelProvider;
    @inject(FileSystem) protected readonly fileSystem: FileSystem;
    @inject(FileSystemWatcher) protected readonly watcher: FileSystemWatcher;

    @postConstruct()
    protected init(): void {
        super.init();
        this.toDispose.push(this.watcher.onFilesChanged(changes => this.onFilesChanged(changes)));
        this.toDispose.push(this.watcher.onDidMove(move => this.onDidMove(move)));
    }

    get location(): URI | undefined {
        const root = this.root;
        if (FileStatNode.is(root)) {
            return root.uri;
        }
        return undefined;
    }

    set location(uri: URI | undefined) {
        if (uri) {
            this.fileSystem.getFileStat(uri.toString()).then(async fileStat => {
                if (fileStat) {
                    const label = this.labelProvider.getName(uri);
                    const icon = await this.labelProvider.getIcon(fileStat);
                    const node = DirNode.createRoot(fileStat, label, icon);
                    this.navigateTo(node);
                }
            });
        } else {
            this.navigateTo(undefined);
        }
    }

    async drives(): Promise<URI[]> {
        try {
            const drives = await this.fileSystem.getDrives();
            return drives.map(uri => new URI(uri));
        } catch (e) {
            this.logger.error('Error when loading drives.', e);
            return [];
        }
    }

    get selectedFileStatNodes(): Readonly<FileStatNode>[] {
        return this.selectedNodes.filter(FileStatNode.is);
    }

    *getNodesByUri(uri: URI): IterableIterator<TreeNode> {
        const node = this.getNode(uri.toString());
        if (node) {
            yield node;
        }
    }

    /**
     * to workaround https://github.com/Axosoft/nsfw/issues/42
     */
    protected onDidMove(move: FileMoveEvent): void {
        if (FileMoveEvent.isRename(move)) {
            return;
        }
        this.refreshAffectedNodes([
            move.sourceUri.parent,
            move.targetUri.parent
        ]);
    }

    protected onFilesChanged(changes: FileChange[]): void {
        if (!this.refreshAffectedNodes(this.getAffectedUris(changes)) && this.isRootAffected(changes)) {
            this.refresh();
        }
    }

    protected isRootAffected(changes: FileChange[]): boolean {
        const root = this.root;
        if (FileStatNode.is(root)) {
            return changes.some(change =>
                change.type < FileChangeType.DELETED && change.uri.toString() === root.uri.toString()
            );
        }
        return false;
    }

    protected getAffectedUris(changes: FileChange[]): URI[] {
        return changes.filter(change => !this.isFileContentChanged(change)).map(change => change.uri);
    }

    protected isFileContentChanged(change: FileChange): boolean {
        return change.type === FileChangeType.UPDATED && FileNode.is(this.getNodesByUri(change.uri).next().value);
    }

    protected refreshAffectedNodes(uris: URI[]): boolean {
        const nodes = this.getAffectedNodes(uris);
        for (const node of nodes.values()) {
            this.refresh(node);
        }
        return nodes.size !== 0;
    }

    protected getAffectedNodes(uris: URI[]): Map<string, CompositeTreeNode> {
        const nodes = new Map<string, CompositeTreeNode>();
        for (const uri of uris) {
            for (const node of this.getNodesByUri(uri.parent)) {
                if (DirNode.is(node) && node.expanded) {
                    nodes.set(node.id, node);
                }
            }
        }
        return nodes;
    }

    copy(uri: URI): boolean {
        if (uri.scheme !== 'file') {
            return false;
        }
        const node = this.selectedFileStatNodes[0];
        if (!node) {
            return false;
        }
        const targetUri = node.uri.resolve(uri.path.base);
        /* Check if the folder is copied on itself */
        const sourcePath = uri.path.toString();
        const targetPath = node.uri.path.toString();
        if (sourcePath === targetPath) {
            return false;
        }

        this.fileSystem.copy(uri.toString(), targetUri.toString());
        return true;
    }

    /**
     * Move the given source file or directory to the given target directory.
     */
    async move(source: TreeNode, target: TreeNode): Promise<void> {
        if (DirNode.is(target) && FileStatNode.is(source)) {
            const sourceUri = source.uri.toString();
            if (target.uri.toString() === sourceUri) { /*  Folder on itself */
                return;
            }
            const targetUri = target.uri.resolve(source.name).toString();
            if (sourceUri !== targetUri) { /*  File not on itself */
                const fileExistsInTarget = await this.fileSystem.exists(targetUri);
                if (!fileExistsInTarget || await this.shouldReplace(source.name)) {
                    await this.fileSystem.move(sourceUri, targetUri, { overwrite: true });
                }
            }
        }
    }

    protected async shouldReplace(fileName: string): Promise<boolean> {
        const dialog = new ConfirmDialog({
            title: 'Replace file',
            msg: `File '${fileName}' already exists in the destination folder. Do you want to replace it?`,
            ok: 'Yes',
            cancel: 'No'
        });
        return !!await dialog.open();
    }

    upload(node: DirNode, items: DataTransferItemList): void {
        for (let i = 0; i < items.length; i++) {
            const entry = items[i].webkitGetAsEntry() as WebKitEntry;
            this.uploadEntry(node.uri, entry);
        }
    }

    protected uploadEntry(base: URI, entry: WebKitEntry | null): void {
        if (!entry) {
            return;
        }
        if (entry.isDirectory) {
            this.uploadDirectoryEntry(base, entry as WebKitDirectoryEntry);
        } else {
            this.uploadFileEntry(base, entry as WebKitFileEntry);
        }
    }

    protected async uploadDirectoryEntry(base: URI, entry: WebKitDirectoryEntry): Promise<void> {
        const newBase = base.resolve(entry.name);
        const uri = newBase.toString();
        if (!await this.fileSystem.exists(uri)) {
            await this.fileSystem.createFolder(uri);
        }
        this.readEntries(entry, items => this.uploadEntries(newBase, items));
    }

    /**
     *  Read all entries within a folder by block of 100 files or folders until the
     *  whole folder has been read.
     */
    // tslint:disable-next-line:no-any
    protected readEntries(entry: WebKitDirectoryEntry, cb: (items: any) => void): void {
        const reader = entry.createReader();
        const getEntries = () => {
            reader.readEntries(results => {
                if (results) {
                    cb(results);
                    getEntries(); // loop to read all entries
                }
            });
        };
        getEntries();
    }

    protected uploadEntries(base: URI, entries: WebKitEntry[]): void {
        for (let i = 0; i < entries.length; i++) {
            this.uploadEntry(base, entries[i]);
        }
    }

    protected uploadFileEntry(base: URI, entry: WebKitFileEntry): void {
        // tslint:disable-next-line:no-any
        entry.file(file => this.uploadFile(base, file as any));
    }

    protected uploadFile(base: URI, file: File): void {
        const reader = new FileReader();
        reader.onload = () => this.uploadFileContent(base.resolve(file.name), reader.result as ArrayBuffer);
        reader.readAsArrayBuffer(file);
    }

    protected async uploadFileContent(base: URI, fileContent: ArrayBuffer): Promise<void> {
        const uri = base.toString();
        const encoding = 'base64';
        const content = base64.fromByteArray(new Uint8Array(fileContent));
        const stat = await this.fileSystem.getFileStat(uri);
        if (stat) {
            if (!stat.isDirectory) {
                await this.fileSystem.setContent(stat, content, { encoding });
            }
        } else {
            await this.fileSystem.createFile(uri, { content, encoding });
        }
    }

}

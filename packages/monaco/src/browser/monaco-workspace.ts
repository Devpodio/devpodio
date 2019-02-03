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

// tslint:disable:no-null-keyword

import { injectable, inject, postConstruct } from 'inversify';
import { ProtocolToMonacoConverter, MonacoToProtocolConverter, testGlob } from 'monaco-languageclient';
import URI from '@devpodio/core/lib/common/uri';
import { DisposableCollection } from '@devpodio/core/lib/common';
import { FileSystem, } from '@devpodio/filesystem/lib/common';
import { FileChangeType, FileSystemWatcher } from '@devpodio/filesystem/lib/browser';
import { WorkspaceService } from '@devpodio/workspace/lib/browser';
import { EditorManager, EditorOpenerOptions } from '@devpodio/editor/lib/browser';
import * as lang from '@devpodio/languages/lib/browser';
import { Emitter, TextDocumentWillSaveEvent, TextEdit } from '@devpodio/languages/lib/browser';
import { MonacoTextModelService } from './monaco-text-model-service';
import { WillSaveMonacoModelEvent, MonacoEditorModel, MonacoModelContentChangedEvent } from './monaco-editor-model';
import { MonacoEditor } from './monaco-editor';
import { MonacoConfigurations } from './monaco-configurations';
import { ProblemManager } from '@devpodio/markers/lib/browser';

export interface MonacoDidChangeTextDocumentParams extends lang.DidChangeTextDocumentParams {
    readonly textDocument: MonacoEditorModel;
}

export interface MonacoTextDocumentWillSaveEvent extends TextDocumentWillSaveEvent {
    readonly textDocument: MonacoEditorModel;
}

@injectable()
export class MonacoWorkspace implements lang.Workspace {

    readonly capabilities = {
        applyEdit: true,
        workspaceEdit: {
            documentChanges: true
        }
    };

    protected resolveReady: () => void;
    readonly ready = new Promise<void>(resolve => {
        this.resolveReady = resolve;
    });

    protected readonly onDidOpenTextDocumentEmitter = new Emitter<MonacoEditorModel>();
    readonly onDidOpenTextDocument = this.onDidOpenTextDocumentEmitter.event;

    protected readonly onDidCloseTextDocumentEmitter = new Emitter<MonacoEditorModel>();
    readonly onDidCloseTextDocument = this.onDidCloseTextDocumentEmitter.event;

    protected readonly onDidChangeTextDocumentEmitter = new Emitter<MonacoDidChangeTextDocumentParams>();
    readonly onDidChangeTextDocument = this.onDidChangeTextDocumentEmitter.event;

    protected readonly onWillSaveTextDocumentEmitter = new Emitter<MonacoTextDocumentWillSaveEvent>();
    readonly onWillSaveTextDocument = this.onWillSaveTextDocumentEmitter.event;

    protected readonly onDidSaveTextDocumentEmitter = new Emitter<MonacoEditorModel>();
    readonly onDidSaveTextDocument = this.onDidSaveTextDocumentEmitter.event;

    @inject(FileSystem)
    protected readonly fileSystem: FileSystem;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(FileSystemWatcher)
    protected readonly fileSystemWatcher: FileSystemWatcher;

    @inject(MonacoTextModelService)
    protected readonly textModelService: MonacoTextModelService;

    @inject(MonacoToProtocolConverter)
    protected readonly m2p: MonacoToProtocolConverter;

    @inject(ProtocolToMonacoConverter)
    protected readonly p2m: ProtocolToMonacoConverter;

    @inject(EditorManager)
    protected readonly editorManager: EditorManager;

    @inject(MonacoConfigurations)
    readonly configurations: MonacoConfigurations;

    @inject(ProblemManager)
    protected readonly problems: ProblemManager;

    @postConstruct()
    protected init(): void {
        this.workspaceService.roots.then(roots => {
            const rootStat = roots[0];
            if (rootStat) {
                this._rootUri = rootStat.uri;
                this.resolveReady();
            }
        });

        for (const model of this.textModelService.models) {
            this.fireDidOpen(model);
        }
        this.textModelService.onDidCreate(model => this.fireDidOpen(model));
    }

    protected _rootUri: string | null = null;
    get rootUri(): string | null {
        return this._rootUri;
    }

    get rootPath(): string | null {
        return this._rootUri && new URI(this._rootUri).path.toString();
    }

    get textDocuments(): MonacoEditorModel[] {
        return this.textModelService.models;
    }

    getTextDocument(uri: string): MonacoEditorModel | undefined {
        return this.textModelService.get(uri);
    }

    protected fireDidOpen(model: MonacoEditorModel): void {
        this.doFireDidOpen(model);
        model.textEditorModel.onDidChangeLanguage(e => {
            this.problems.cleanAllMarkers(new URI(model.uri));
            model.setLanguageId(e.oldLanguage);
            try {
                this.fireDidClose(model);
            } finally {
                model.setLanguageId(undefined);
            }
            this.doFireDidOpen(model);
        });
        model.onDidChangeContent(event => this.fireDidChangeContent(event));
        model.onDidSaveModel(() => this.fireDidSave(model));
        model.onWillSaveModel(event => this.fireWillSave(event));
        model.onDirtyChanged(() => this.openEditorIfDirty(model));
        model.onDispose(() => this.fireDidClose(model));
    }

    protected doFireDidOpen(model: MonacoEditorModel): void {
        this.onDidOpenTextDocumentEmitter.fire(model);
    }

    protected fireDidClose(model: MonacoEditorModel): void {
        this.onDidCloseTextDocumentEmitter.fire(model);
    }

    protected fireDidChangeContent(event: MonacoModelContentChangedEvent): void {
        const { model, contentChanges } = event;
        this.onDidChangeTextDocumentEmitter.fire({
            textDocument: model,
            contentChanges
        });
    }

    protected fireWillSave(event: WillSaveMonacoModelEvent): void {
        const { reason } = event;
        const timeout = new Promise<TextEdit[]>(resolve =>
            setTimeout(() => resolve([]), 1000)
        );
        const resolveEdits = new Promise<TextEdit[]>(async resolve => {
            const thenables: Thenable<TextEdit[]>[] = [];
            const allEdits: TextEdit[] = [];

            this.onWillSaveTextDocumentEmitter.fire({
                textDocument: event.model,
                reason,
                waitUntil: thenable => {
                    thenables.push(thenable);
                }
            });

            for (const listenerEdits of await Promise.all(thenables)) {
                allEdits.push(...listenerEdits);
            }

            resolve(allEdits);
        });
        event.waitUntil(
            Promise.race([resolveEdits, timeout]).then(edits =>
                this.p2m.asTextEdits(edits).map(edit => edit as monaco.editor.IIdentifiedSingleEditOperation)
            )
        );
    }

    protected fireDidSave(model: MonacoEditorModel): void {
        this.onDidSaveTextDocumentEmitter.fire(model);
    }

    protected openEditorIfDirty(model: MonacoEditorModel): void {
        if (model.dirty && MonacoEditor.findByDocument(this.editorManager, model).length === 0) {
            // create a new reference to make sure the model is not disposed before it is
            // acquired by the editor, thus losing the changes that made it dirty.
            this.textModelService.createModelReference(model.textEditorModel.uri).then(ref => {
                this.editorManager.open(new URI(model.uri), {
                    mode: 'open',
                }).then(() => ref.dispose());
            });
        }
    }

    createFileSystemWatcher(globPattern: string, ignoreCreateEvents?: boolean, ignoreChangeEvents?: boolean, ignoreDeleteEvents?: boolean): lang.FileSystemWatcher {
        const disposables = new DisposableCollection();
        const onDidCreateEmitter = new lang.Emitter<monaco.Uri>();
        disposables.push(onDidCreateEmitter);
        const onDidChangeEmitter = new lang.Emitter<monaco.Uri>();
        disposables.push(onDidChangeEmitter);
        const onDidDeleteEmitter = new lang.Emitter<monaco.Uri>();
        disposables.push(onDidDeleteEmitter);
        disposables.push(this.fileSystemWatcher.onFilesChanged(changes => {
            for (const change of changes) {
                const fileChangeType = change.type;
                if (ignoreCreateEvents === true && fileChangeType === FileChangeType.ADDED) {
                    continue;
                }
                if (ignoreChangeEvents === true && fileChangeType === FileChangeType.UPDATED) {
                    continue;
                }
                if (ignoreDeleteEvents === true && fileChangeType === FileChangeType.DELETED) {
                    continue;
                }
                const uri = change.uri.toString();
                // tslint:disable-next-line:no-any
                const { codeUri } = (change.uri as any);
                if (testGlob(globPattern, uri)) {
                    if (fileChangeType === FileChangeType.ADDED) {
                        onDidCreateEmitter.fire(codeUri);
                    } else if (fileChangeType === FileChangeType.UPDATED) {
                        onDidChangeEmitter.fire(codeUri);
                    } else if (fileChangeType === FileChangeType.DELETED) {
                        onDidDeleteEmitter.fire(codeUri);
                    } else {
                        throw new Error(`Unexpected file change type: ${fileChangeType}.`);
                    }
                }
            }
        }));
        return {
            onDidCreate: onDidCreateEmitter.event,
            onDidChange: onDidChangeEmitter.event,
            onDidDelete: onDidDeleteEmitter.event,
            dispose: () => disposables.dispose()
        };
    }

    async applyEdit(changes: lang.WorkspaceEdit, options?: EditorOpenerOptions): Promise<boolean> {
        const workspaceEdit = this.p2m.asWorkspaceEdit(changes);
        await this.applyBulkEdit(workspaceEdit, options);
        return true;
    }

    async applyBulkEdit(workspaceEdit: monaco.languages.WorkspaceEdit, options?: EditorOpenerOptions): monaco.Promise<monaco.editor.IBulkEditResult> {
        let totalEdits = 0;
        let totalFiles = 0;
        const uri2Edits = this.groupEdits(workspaceEdit);
        for (const uri of uri2Edits.keys()) {
            const editorWidget = await this.editorManager.open(new URI(uri), options);
            const editor = MonacoEditor.get(editorWidget);
            if (editor) {
                const model = editor.document.textEditorModel;
                const currentSelections = editor.getControl().getSelections();
                const edits = uri2Edits.get(uri)!;
                const editOperations: monaco.editor.IIdentifiedSingleEditOperation[] = edits.map(edit => ({
                    identifier: undefined!,
                    forceMoveMarkers: false,
                    range: new monaco.Range(edit.range.startLineNumber, edit.range.startColumn, edit.range.endLineNumber, edit.range.endColumn),
                    text: edit.text
                }));
                // start a fresh operation
                model.pushStackElement();
                model.pushEditOperations(currentSelections, editOperations, (undoEdits: monaco.editor.IIdentifiedSingleEditOperation[]) => currentSelections);
                // push again to make this change an undoable operation
                model.pushStackElement();
                totalFiles += 1;
                totalEdits += editOperations.length;
            }
        }
        const ariaSummary = this.getAriaSummary(totalEdits, totalFiles);
        return { ariaSummary };
    }

    protected getAriaSummary(totalEdits: number, totalFiles: number): string {
        if (totalEdits === 0) {
            return 'Made no edits';
        }
        if (totalEdits > 1 && totalFiles > 1) {
            return `Made ${totalEdits} text edits in ${totalFiles} files`;
        }
        return `Made ${totalEdits} text edits in one file`;
    }

    protected groupEdits(workspaceEdit: monaco.languages.WorkspaceEdit) {
        const result = new Map<string, monaco.languages.TextEdit[]>();
        for (const edit of workspaceEdit.edits) {
            const resourceTextEdit = edit as monaco.languages.ResourceTextEdit;
            const uri = resourceTextEdit.resource.toString();
            const edits = result.get(uri) || [];
            edits.push(...resourceTextEdit.edits);
            result.set(uri, edits);
        }
        return result;
    }

}

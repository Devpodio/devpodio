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

import {
    LanguagesMain,
    SerializedLanguageConfiguration,
    SerializedRegExp,
    SerializedIndentationRule,
    SerializedOnEnterRule,
    MAIN_RPC_CONTEXT,
    LanguagesExt,
    WorkspaceEditDto,
    ResourceTextEditDto,
    ResourceFileEditDto,
} from '../../api/plugin-api';
import { interfaces } from 'inversify';
import { SerializedDocumentFilter, MarkerData, Range, WorkspaceSymbolProvider, RelatedInformation, MarkerSeverity } from '../../api/model';
import { RPCProtocol } from '../../api/rpc-protocol';
import { fromLanguageSelector } from '../../plugin/type-converters';
import { LanguageSelector } from '../../plugin/languages';
import { DocumentFilter, MonacoModelIdentifier, testGlob, getLanguages } from 'monaco-languageclient/lib';
import { DisposableCollection, Emitter } from '@devpodio/core';
import { MonacoLanguages } from '@devpodio/monaco/lib/browser/monaco-languages';
import URI from 'vscode-uri/lib/umd';
import CoreURI from '@devpodio/core/lib/common/uri';
import { ProblemManager } from '@devpodio/markers/lib/browser';
import * as vst from 'vscode-languageserver-types';

export class LanguagesMainImpl implements LanguagesMain {

    private ml: MonacoLanguages;
    private problemManager: ProblemManager;

    private readonly proxy: LanguagesExt;
    private readonly disposables = new Map<number, monaco.IDisposable>();
    constructor(rpc: RPCProtocol, container: interfaces.Container) {
        this.proxy = rpc.getProxy(MAIN_RPC_CONTEXT.LANGUAGES_EXT);
        this.ml = container.get(MonacoLanguages);
        this.problemManager = container.get(ProblemManager);
    }

    $getLanguages(): Promise<string[]> {
        return Promise.resolve(monaco.languages.getLanguages().map(l => l.id));
    }

    $unregister(handle: number): void {
        const disposable = this.disposables.get(handle);
        if (disposable) {
            disposable.dispose();
            this.disposables.delete(handle);
        }
    }

    $setLanguageConfiguration(handle: number, languageId: string, configuration: SerializedLanguageConfiguration): void {
        const config: monaco.languages.LanguageConfiguration = {
            comments: configuration.comments,
            brackets: configuration.brackets,
            wordPattern: reviveRegExp(configuration.wordPattern),
            indentationRules: reviveIndentationRule(configuration.indentationRules),
            onEnterRules: reviveOnEnterRules(configuration.onEnterRules),
        };

        this.disposables.set(handle, monaco.languages.setLanguageConfiguration(languageId, config));
    }

    $registerCompletionSupport(handle: number, selector: SerializedDocumentFilter[], triggerCharacters: string[], supportsResolveDetails: boolean): void {
        this.disposables.set(handle, monaco.modes.SuggestRegistry.register(fromLanguageSelector(selector)!, {
            triggerCharacters,
            provideCompletionItems: (model: monaco.editor.ITextModel,
                position: monaco.Position,
                context: monaco.modes.SuggestContext,
                token: monaco.CancellationToken): Thenable<monaco.modes.ISuggestResult> =>
                Promise.resolve(this.proxy.$provideCompletionItems(handle, model.uri, position, context)).then(result => {
                    if (!result) {
                        return undefined!;
                    }
                    return {
                        suggestions: result.completions,
                        incomplete: result.incomplete,
                        // tslint:disable-next-line:no-any
                        dispose: () => this.proxy.$releaseCompletionItems(handle, (<any>result)._id)
                    };
                }),
            resolveCompletionItem: supportsResolveDetails
                ? (model, position, suggestion, token) => Promise.resolve(this.proxy.$resolveCompletionItem(handle, model.uri, position, suggestion))
                : undefined
        }));
    }

    $registerDefinitionProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const definitionProvider = this.createDefinitionProvider(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerDefinitionProvider(language, definitionProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    $registerReferenceProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const referenceProvider = this.createReferenceProvider(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerReferenceProvider(language, referenceProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createReferenceProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.ReferenceProvider {
        return {
            provideReferences: (model, position, context, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideReferences(handle, model.uri, position, context).then(result => {
                    if (!result) {
                        return undefined!;
                    }

                    if (Array.isArray(result)) {
                        const references: monaco.languages.Location[] = [];
                        for (const item of result) {
                            references.push({ ...item, uri: monaco.Uri.revive(item.uri) });
                        }
                        return references;
                    }

                    return undefined!;
                });
            }
        };
    }

    $registerSignatureHelpProvider(handle: number, selector: SerializedDocumentFilter[], triggerCharacters: string[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const signatureHelpProvider = this.createSignatureHelpProvider(handle, languageSelector, triggerCharacters);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerSignatureHelpProvider(language, signatureHelpProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    $clearDiagnostics(id: string): void {
        for (const uri of this.problemManager.getUris()) {
            this.problemManager.setMarkers(new CoreURI(uri), id, []);
        }
    }

    $changeDiagnostics(id: string, delta: [string, MarkerData[]][]): void {
        for (const [uriString, markers] of delta) {
            const uri = new CoreURI(uriString);
            this.problemManager.setMarkers(uri, id, markers.map(reviveMarker));
        }
    }

    $registerImplementationProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const implementationProvider = this.createImplementationProvider(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerImplementationProvider(language, implementationProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createImplementationProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.ImplementationProvider {
        return {
            provideImplementation: (model, position, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideImplementation(handle, model.uri, position).then(result => {
                    if (!result) {
                        return undefined!;
                    }

                    if (Array.isArray(result)) {
                        // using DefinitionLink because Location is mandatory part of DefinitionLink
                        const definitionLinks: monaco.languages.DefinitionLink[] = [];
                        for (const item of result) {
                            definitionLinks.push({ ...item, uri: monaco.Uri.revive(item.uri) });
                        }
                        return definitionLinks;
                    } else {
                        // single Location
                        return <monaco.languages.Location>{
                            uri: monaco.Uri.revive(result.uri),
                            range: result.range
                        };
                    }
                });
            }
        };
    }

    $registerTypeDefinitionProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const typeDefinitionProvider = this.createTypeDefinitionProvider(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerTypeDefinitionProvider(language, typeDefinitionProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createTypeDefinitionProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.TypeDefinitionProvider {
        return {
            provideTypeDefinition: (model, position, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideTypeDefinition(handle, model.uri, position).then(result => {
                    if (!result) {
                        return undefined!;
                    }

                    if (Array.isArray(result)) {
                        // using DefinitionLink because Location is mandatory part of DefinitionLink
                        const definitionLinks: monaco.languages.DefinitionLink[] = [];
                        for (const item of result) {
                            definitionLinks.push({ ...item, uri: monaco.Uri.revive(item.uri) });
                        }
                        return definitionLinks;
                    } else {
                        // single Location
                        return <monaco.languages.Location>{
                            uri: monaco.Uri.revive(result.uri),
                            range: result.range
                        };
                    }
                });
            }
        };
    }

    $registerHoverProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const hoverProvider = this.createHoverProvider(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerHoverProvider(language, hoverProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createHoverProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.HoverProvider {
        return {
            provideHover: (model, position, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideHover(handle, model.uri, position).then(v => v!);
            }
        };
    }

    $registerDocumentHighlightProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const documentHighlightProvider = this.createDocumentHighlightProvider(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerDocumentHighlightProvider(language, documentHighlightProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createDocumentHighlightProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.DocumentHighlightProvider {
        return {
            provideDocumentHighlights: (model, position, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideDocumentHighlights(handle, model.uri, position).then(result => {
                    if (!result) {
                        return undefined!;
                    }

                    if (Array.isArray(result)) {
                        const highlights: monaco.languages.DocumentHighlight[] = [];
                        for (const item of result) {
                            highlights.push(
                                {
                                    ...item,
                                    kind: (item.kind ? item.kind : monaco.languages.DocumentHighlightKind.Text)
                                });
                        }
                        return highlights;
                    }

                    return undefined!;
                });

            }
        };
    }

    $registerWorkspaceSymbolProvider(handle: number): void {
        const workspaceSymbolProvider = this.createWorkspaceSymbolProvider(handle);
        const disposable = new DisposableCollection();
        disposable.push(this.ml.registerWorkspaceSymbolProvider(workspaceSymbolProvider));
        this.disposables.set(handle, disposable);
    }

    protected createWorkspaceSymbolProvider(handle: number): WorkspaceSymbolProvider {
        return {
            provideWorkspaceSymbols: (params, token) => this.proxy.$provideWorkspaceSymbols(handle, params.query),
            resolveWorkspaceSymbol: (symbol, token) => this.proxy.$resolveWorkspaceSymbol(handle, symbol)
        };
    }

    $registerDocumentLinkProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const linkProvider = this.createLinkProvider(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerLinkProvider(language, linkProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createLinkProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.LinkProvider {
        return {
            provideLinks: (model, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideDocumentLinks(handle, model.uri).then(v => v!);
            },
            resolveLink: (link: monaco.languages.ILink, token) =>
                this.proxy.$resolveDocumentLink(handle, link).then(v => v!)
        };
    }

    $registerCodeLensSupport(handle: number, selector: SerializedDocumentFilter[], eventHandle: number): void {
        const languageSelector = fromLanguageSelector(selector);
        const lensProvider = this.createCodeLensProvider(handle, languageSelector);

        if (typeof eventHandle === 'number') {
            const emitter = new Emitter<monaco.languages.CodeLensProvider>();
            this.disposables.set(eventHandle, emitter);
            lensProvider.onDidChange = emitter.event;
        }

        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerCodeLensProvider(language, lensProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createCodeLensProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.CodeLensProvider {
        return {
            provideCodeLenses: (model, token) =>
                this.proxy.$provideCodeLenses(handle, model.uri).then(v => v!)
            ,
            resolveCodeLens: (model, codeLens, token) =>
                this.proxy.$resolveCodeLens(handle, model.uri, codeLens).then(v => v!)
        };
    }

    // tslint:disable-next-line:no-any
    $emitCodeLensEvent(eventHandle: number, event?: any): void {
        const obj = this.disposables.get(eventHandle);
        if (obj instanceof Emitter) {
            obj.fire(event);
        }
    }

    $registerOutlineSupport(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const symbolProvider = this.createDocumentSymbolProvider(handle, languageSelector);

        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerDocumentSymbolProvider(language, symbolProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createDocumentSymbolProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.DocumentSymbolProvider {
        return {
            provideDocumentSymbols: (model, token) =>
                this.proxy.$provideDocumentSymbols(handle, model.uri).then(v => v!)
        };
    }

    protected createDefinitionProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.DefinitionProvider {
        return {
            provideDefinition: (model, position, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideDefinition(handle, model.uri, position).then(result => {
                    if (!result) {
                        return undefined!;
                    }

                    if (Array.isArray(result)) {
                        // using DefinitionLink because Location is mandatory part of DefinitionLink
                        const definitionLinks: monaco.languages.DefinitionLink[] = [];
                        for (const item of result) {
                            definitionLinks.push({ ...item, uri: monaco.Uri.revive(item.uri) });
                        }
                        return definitionLinks;
                    } else {
                        // single Location
                        return <monaco.languages.Location>{
                            uri: monaco.Uri.revive(result.uri),
                            range: result.range
                        };
                    }
                });
            }
        };
    }

    protected createSignatureHelpProvider(handle: number, selector: LanguageSelector | undefined, triggerCharacters: string[]): monaco.languages.SignatureHelpProvider {
        return {
            signatureHelpTriggerCharacters: triggerCharacters,
            provideSignatureHelp: (model, position, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideSignatureHelp(handle, model.uri, position).then(v => v!);
            }
        };
    }

    $registerDocumentFormattingSupport(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const documentFormattingEditSupport = this.createDocumentFormattingSupport(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerDocumentFormattingEditProvider(language, documentFormattingEditSupport));
            }
        }
        this.disposables.set(handle, disposable);
    }

    createDocumentFormattingSupport(handle: number, selector: LanguageSelector | undefined): monaco.languages.DocumentFormattingEditProvider {
        return {
            provideDocumentFormattingEdits: (model, options, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideDocumentFormattingEdits(handle, model.uri, options).then(v => v!);
            }
        };
    }

    $registerRangeFormattingProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const rangeFormattingEditProvider = this.createRangeFormattingProvider(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerDocumentRangeFormattingEditProvider(language, rangeFormattingEditProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    createRangeFormattingProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.DocumentRangeFormattingEditProvider {
        return {
            provideDocumentRangeFormattingEdits: (model, range: Range, options, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideDocumentRangeFormattingEdits(handle, model.uri, range, options).then(v => v!);
            }
        };
    }

    $registerOnTypeFormattingProvider(handle: number, selector: SerializedDocumentFilter[], autoFormatTriggerCharacters: string[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const onTypeFormattingProvider = this.createOnTypeFormattingProvider(handle, languageSelector, autoFormatTriggerCharacters);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerOnTypeFormattingEditProvider(language, onTypeFormattingProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createOnTypeFormattingProvider(
        handle: number,
        selector: LanguageSelector | undefined,
        autoFormatTriggerCharacters: string[]
    ): monaco.languages.OnTypeFormattingEditProvider {
        return {
            autoFormatTriggerCharacters,
            provideOnTypeFormattingEdits: (model, position, ch, options) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideOnTypeFormattingEdits(handle, model.uri, position, ch, options).then(v => v!);
            }
        };
    }

    $registerFoldingRangeProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const provider = this.createFoldingRangeProvider(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerFoldingRangeProvider(language, provider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    createFoldingRangeProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.FoldingRangeProvider {
        return {
            provideFoldingRanges: (model, context, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideFoldingRange(handle, model.uri, context).then(v => v!);
            }
        };
    }

    $registerDocumentColorProvider(handle: number, selector: SerializedDocumentFilter[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const colorProvider = this.createColorProvider(handle, languageSelector);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerColorProvider(language, colorProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    createColorProvider(handle: number, selector: LanguageSelector | undefined): monaco.languages.DocumentColorProvider {
        return {
            provideDocumentColors: (model, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideDocumentColors(handle, model.uri).then(documentColors =>
                    documentColors.map(documentColor => {
                        const [red, green, blue, alpha] = documentColor.color;
                        const color = {
                            red: red,
                            green: green,
                            blue: blue,
                            alpha: alpha
                        };

                        return {
                            color,
                            range: documentColor.range
                        };
                    })
                );
            },
            provideColorPresentations: (model, colorInfo, token) =>
                this.proxy.$provideColorPresentations(handle, model.uri, {
                    color: [
                        colorInfo.color.red,
                        colorInfo.color.green,
                        colorInfo.color.blue,
                        colorInfo.color.alpha
                    ],
                    range: colorInfo.range
                })
        };
    }

    $registerQuickFixProvider(handle: number, selector: SerializedDocumentFilter[], codeActionKinds?: string[]): void {
        const languageSelector = fromLanguageSelector(selector);
        const quickFixProvider = this.createQuickFixProvider(handle, languageSelector, codeActionKinds);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerCodeActionProvider(language, quickFixProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createQuickFixProvider(handle: number, selector: LanguageSelector | undefined, providedCodeActionKinds?: string[]): monaco.languages.CodeActionProvider {
        return {
            provideCodeActions: (model, rangeOrSelection, monacoContext) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideCodeActions(handle, model.uri, rangeOrSelection, monacoContext);
            }
        };
    }

    $registerRenameProvider(handle: number, selector: SerializedDocumentFilter[], supportsResolveLocation: boolean): void {
        const languageSelector = fromLanguageSelector(selector);
        const renameProvider = this.createRenameProvider(handle, languageSelector, supportsResolveLocation);
        const disposable = new DisposableCollection();
        for (const language of getLanguages()) {
            if (this.matchLanguage(languageSelector, language)) {
                disposable.push(monaco.languages.registerRenameProvider(language, renameProvider));
            }
        }
        this.disposables.set(handle, disposable);
    }

    protected createRenameProvider(handle: number, selector: LanguageSelector | undefined, supportsResolveLocation: boolean): monaco.languages.RenameProvider {
        return {
            provideRenameEdits: (model, position, newName, token) => {
                if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                    return undefined!;
                }
                return this.proxy.$provideRenameEdits(handle, model.uri, position, newName)
                    .then(v => reviveWorkspaceEditDto(v!));
            },
            resolveRenameLocation: supportsResolveLocation
                ? (model, position, token) => {
                    if (!this.matchModel(selector, MonacoModelIdentifier.fromModel(model))) {
                        return undefined!;
                    }
                    return this.proxy.$resolveRenameLocation(handle, model.uri, position).then(v => v!);
                }
                : undefined
        };
    }

    protected matchModel(selector: LanguageSelector | undefined, model: MonacoModelIdentifier): boolean {
        if (Array.isArray(selector)) {
            return selector.some(filter => this.matchModel(filter, model));
        }
        if (DocumentFilter.is(selector)) {
            if (!!selector.language && selector.language !== model.languageId) {
                return false;
            }
            if (!!selector.scheme && selector.scheme !== model.uri.scheme) {
                return false;
            }
            if (!!selector.pattern && !testGlob(selector.pattern, model.uri.path)) {
                return false;
            }
            return true;
        }
        return selector === model.languageId;
    }

    protected matchLanguage(selector: LanguageSelector | undefined, languageId: string): boolean {
        if (Array.isArray(selector)) {
            return selector.some(filter => this.matchLanguage(filter, languageId));
        }

        if (DocumentFilter.is(selector)) {
            return !selector.language || selector.language === languageId;
        }

        return selector === languageId;
    }
}

function reviveMarker(marker: MarkerData): vst.Diagnostic {
    const monacoMarker: vst.Diagnostic = {
        code: marker.code,
        severity: reviveSeverity(marker.severity),
        range: reviveRange(marker.startLineNumber, marker.startColumn, marker.endLineNumber, marker.endColumn),
        message: marker.message,
        source: marker.source,
        relatedInformation: undefined
    };

    if (marker.relatedInformation) {
        monacoMarker.relatedInformation = marker.relatedInformation.map(reviveRelated);
    }

    return monacoMarker;
}

function reviveSeverity(severity: MarkerSeverity): vst.DiagnosticSeverity {
    switch (severity) {
        case MarkerSeverity.Error: return vst.DiagnosticSeverity.Error;
        case MarkerSeverity.Warning: return vst.DiagnosticSeverity.Warning;
        case MarkerSeverity.Info: return vst.DiagnosticSeverity.Information;
        case MarkerSeverity.Hint: return vst.DiagnosticSeverity.Hint;
    }
}

function reviveRange(startLine: number, startColumn: number, endLine: number, endColumn: number): vst.Range {
    // note: language server range is 0-based, marker is 1-based, so need to deduct 1 here
    return {
        start: {
            line: startLine - 1,
            character: startColumn - 1
        },
        end: {
            line: endLine - 1,
            character: endColumn - 1
        }
    };
}

function reviveRelated(related: RelatedInformation): vst.DiagnosticRelatedInformation {
    return {
        message: related.message,
        location: {
            uri: related.resource,
            range: reviveRange(related.startLineNumber, related.startColumn, related.endLineNumber, related.endColumn)
        }
    };
}

function reviveRegExp(regExp?: SerializedRegExp): RegExp | undefined {
    if (typeof regExp === 'undefined' || regExp === null) {
        return undefined;
    }
    return new RegExp(regExp.pattern, regExp.flags);
}

function reviveIndentationRule(indentationRule?: SerializedIndentationRule): monaco.languages.IndentationRule | undefined {
    if (typeof indentationRule === 'undefined' || indentationRule === null) {
        return undefined;
    }
    return {
        increaseIndentPattern: reviveRegExp(indentationRule.increaseIndentPattern)!,
        decreaseIndentPattern: reviveRegExp(indentationRule.decreaseIndentPattern)!,
        indentNextLinePattern: reviveRegExp(indentationRule.indentNextLinePattern),
        unIndentedLinePattern: reviveRegExp(indentationRule.unIndentedLinePattern),
    };
}

function reviveOnEnterRule(onEnterRule: SerializedOnEnterRule): monaco.languages.OnEnterRule {
    return {
        beforeText: reviveRegExp(onEnterRule.beforeText)!,
        afterText: reviveRegExp(onEnterRule.afterText),
        action: onEnterRule.action
    };
}

function reviveOnEnterRules(onEnterRules?: SerializedOnEnterRule[]): monaco.languages.OnEnterRule[] | undefined {
    if (typeof onEnterRules === 'undefined' || onEnterRules === null) {
        return undefined;
    }
    return onEnterRules.map(reviveOnEnterRule);
}

export function reviveWorkspaceEditDto(data: WorkspaceEditDto): monaco.languages.WorkspaceEdit {
    if (data && data.edits) {
        for (const edit of data.edits) {
            if (typeof (<ResourceTextEditDto>edit).resource === 'object') {
                (<ResourceTextEditDto>edit).resource = URI.revive((<ResourceTextEditDto>edit).resource);
            } else {
                (<ResourceFileEditDto>edit).newUri = URI.revive((<ResourceFileEditDto>edit).newUri);
                (<ResourceFileEditDto>edit).oldUri = URI.revive((<ResourceFileEditDto>edit).oldUri);
            }
        }
    }
    return <monaco.languages.WorkspaceEdit>data;
}

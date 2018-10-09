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

import { injectable } from 'inversify';
import { Disposable, DisposableCollection } from '@theia/core/lib/common/disposable';
import { ILanguageClient, TextDocumentPositionParams, TextDocumentIdentifier, Position, Location, DocumentSymbol } from '@theia/languages/lib/browser';
import { DocumentSymbolExt } from '@theia/languages/lib/browser/typehierarchy/typehierarchy-protocol';
import { SubTypeHierarchyFeature, SuperTypeHierarchyFeature, TypeHierarchyFeature, TypeHierarchyType } from '@theia/languages/lib/browser/typehierarchy/typehierarchy-feature';

@injectable()
export class TypeHierarchyService implements Disposable {

    protected readonly subTypeFeatures = new Map<string, SubTypeHierarchyFeature>();
    protected readonly superTypeFeatures = new Map<string, SuperTypeHierarchyFeature>();

    /**
     * Registers the `newFeature` for the given language into this service. The `newFeature` will be removed from this service, when the feature is disposed.
     * This method also makes sure that existing features for the given language (`languageId`) will be disposed before registering the new one.
     */
    register<T extends TypeHierarchyFeature>(newFeature: T): void {
        const { type, languageId } = newFeature;
        const toDisposeOnFeatureDispose = new DisposableCollection();
        toDisposeOnFeatureDispose.push(newFeature.onInitialized(() => {
            const features = this.features(type);
            const oldFeature = features.get(languageId);
            if (oldFeature) {
                oldFeature.dispose();
            }
            features.set(languageId, newFeature);
        }));
        toDisposeOnFeatureDispose.push(newFeature.onDisposed(() => {
            const features = this.features(type);
            if (features.has(languageId)) {
                features.get(languageId)!.dispose();
            }
            toDisposeOnFeatureDispose.dispose();
        }));
    }

    /**
     * Disposes the service.
     */
    dispose(): void {
        [this.subTypeFeatures, this.superTypeFeatures].forEach(map => map.forEach(feature => feature.dispose()));
        [this.subTypeFeatures, this.superTypeFeatures].forEach(map => map.clear());
    }

    /**
     * `true` if the type hierarchy is supported for the given language. Otherwise, `false`.
     * It is always `false` for a given language unless the connection between the language client and the server has been established.
     */
    isEnabledFor(languageId: string | undefined): boolean {
        return !!languageId && this.subTypeFeatures.has(languageId) && this.superTypeFeatures.has(languageId);
    }

    /**
     * Returns with the document symbol and its supertypes for the given argument.
     */
    async superTypes(languageId: string, symbol: DocumentSymbolExt): Promise<DocumentSymbolExt | undefined>;
    async superTypes(languageId: string, location: Location): Promise<DocumentSymbolExt | undefined>;
    async superTypes(languageId: string, params: TextDocumentPositionParams): Promise<DocumentSymbolExt | undefined>;
    async superTypes(languageId: string, arg: DocumentSymbolExt | TextDocumentPositionParams | Location): Promise<DocumentSymbolExt | undefined> {
        return this.types(this.superTypeFeatures.get(languageId), arg);
    }

    /**
     * Returns with the document symbol and its subtypes for the given argument.
     */
    async subTypes(languageId: string, symbol: DocumentSymbolExt): Promise<DocumentSymbolExt | undefined>;
    async subTypes(languageId: string, params: TextDocumentPositionParams): Promise<DocumentSymbolExt | undefined>;
    async subTypes(languageId: string, location: Location): Promise<DocumentSymbolExt | undefined>;
    async subTypes(languageId: string, arg: DocumentSymbolExt | TextDocumentPositionParams | Location): Promise<DocumentSymbolExt | undefined> {
        return this.types(this.subTypeFeatures.get(languageId), arg);
    }

    /**
     * Performs the `textDocument/subTypes` and `textDocument/superTypes` LSP method invocations.
     */
    protected async types(feature: TypeHierarchyFeature | undefined, arg: DocumentSymbolExt | TextDocumentPositionParams | Location): Promise<DocumentSymbolExt | undefined> {
        if (feature) {
            const params = this.toTextDocumentPositionParams(arg);
            return feature.get(params);
        }
        return undefined;
    }

    /**
     * Converts the argument into a text document position parameter. Returns with the argument if it was a text document position parameter.
     */
    protected toTextDocumentPositionParams(arg: DocumentSymbolExt | TextDocumentPositionParams | Location): TextDocumentPositionParams {
        if (this.isTextDocumentPositionParams(arg)) {
            return arg;
        }
        const position = DocumentSymbol.is(arg) ? arg.selectionRange.start : arg.range.start;
        const { uri } = arg;
        return {
            position,
            textDocument: {
                uri
            }
        };
    }

    /**
     * Returns with the features map for the give hierarchy type argument.
     */
    protected features(type: TypeHierarchyType): Map<string, TypeHierarchyFeature> {
        switch (type) {
            case TypeHierarchyType.SUBTYPE: return this.subTypeFeatures;
            case TypeHierarchyType.SUPERTYPE: return this.superTypeFeatures;
            default: throw new Error(`Unknown type hierarchy type: ${type}.`);
        }
    }

    // tslint:disable-next-line:no-any
    protected isTextDocumentPositionParams(args: any): args is TextDocumentPositionParams {
        return !!args
            && 'position' in args
            && 'textDocument' in args
            && Position.is(args['position'])
            && TextDocumentIdentifier.is(args['textDocument']);
    }

}

export namespace TypeHierarchyService {

    /**
     * Creates two new language features for handling the subtype and supertype hierarchies via the LSP.
     * The new features will be registered into the type hierarchy `service`.
     */
    export function createNewFeatures(
        service: TypeHierarchyService,
        client: ILanguageClient & Readonly<{ languageId: string }>): [SubTypeHierarchyFeature, SuperTypeHierarchyFeature] {

        const subtypeFeature = new SubTypeHierarchyFeature(client);
        const supertypeFeature = new SuperTypeHierarchyFeature(client);
        service.register(subtypeFeature);
        service.register(supertypeFeature);
        return [subtypeFeature, supertypeFeature];
    }

}

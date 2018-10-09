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

import { v4 } from 'uuid';
import { Emitter, Event } from '@theia/core/lib/common/event';
import { DisposableCollection } from '@theia/core/lib/common/disposable';
import {
    Disposable,
    ILanguageClient,
    DocumentSelector,
    ClientCapabilities,
    ServerCapabilities,
    TextDocumentFeature,
    TextDocumentPositionParams,
    TextDocumentRegistrationOptions
} from '../index';
import { TypeHierarchyMessageType, DocumentSymbolExt, SubTypesRequest, SuperTypesRequest } from './typehierarchy-protocol';

// NOTE: This module can be removed, or at least can be simplified once the type hierarchy will become the part of the LSP.
// https://github.com/Microsoft/language-server-protocol/issues/582
// https://github.com/Microsoft/vscode-languageserver-node/pull/346#discussion_r221659062

/**
 * Abstract text document feature for handling super- and subtype hierarchies through the LSP.
 */
export abstract class TypeHierarchyFeature extends TextDocumentFeature<TextDocumentRegistrationOptions> {

    readonly languageId: string;

    protected readonly onInitializedEmitter = new Emitter<void>();
    protected readonly onDisposedEmitter = new Emitter<void>();
    protected readonly toDispose = new DisposableCollection(this.onInitializedEmitter, this.onDisposedEmitter);

    protected constructor(
        readonly client: ILanguageClient & Readonly<{ languageId: string }>,
        readonly type: TypeHierarchyType,
        protected readonly messageType: TypeHierarchyMessageType) {

        super(client, messageType);
        this.languageId = client.languageId;
    }

    fillClientCapabilities(capabilities: ClientCapabilities): void {
        if (!capabilities.textDocument) {
            capabilities.textDocument = {};
        }
        // tslint:disable-next-line:no-any
        (capabilities.textDocument as any).typeHierarchyCapabilities = {
            typeHierarchy: true
        };
    }

    initialize(capabilities: ServerCapabilities, documentSelector: DocumentSelector): void {
        if (!documentSelector) {
            return;
        }
        const capabilitiesExt: ServerCapabilities & { typeHierarchy?: boolean } = capabilities;
        if (capabilitiesExt.typeHierarchy) {
            this.onInitializedEmitter.fire(undefined);
            const id = v4();
            this.register(this.messages, {
                id,
                registerOptions: Object.assign({}, { documentSelector: documentSelector }, capabilitiesExt.typeHierarchy)
            });
        }
    }

    dispose(): void {
        this.onDisposedEmitter.fire(undefined);
        super.dispose();
    }

    /**
     * Performs the `textDocument/subTypes` and `textDocument/superTypes` LSP method invocations.
     */
    async get(params: TextDocumentPositionParams): Promise<DocumentSymbolExt | undefined> {
        const symbol = await this._client.sendRequest(this.messageType, params);
        return DocumentSymbolExt.is(symbol) ? symbol : undefined;
    }

    /**
     * Called when the feature is disposed.
     */
    get onDisposed(): Event<void> {
        return this.onDisposedEmitter.event;
    }

    /**
     * Called when the feature is initialized. The event fires only when the server set the `capabilitiesExt.typeHierarchy` to `true`.
     */
    get onInitialized(): Event<void> {
        return this.onInitializedEmitter.event;
    }

    protected registerLanguageProvider(): Disposable {
        return Disposable.create(() => this.toDispose.dispose());
    }

}

/**
 * Enumeration of available type hierarchy types.
 */
export enum TypeHierarchyType {
    SUBTYPE = 'subtype',
    SUPERTYPE = 'supertype'
}

export namespace TypeHierarchyType {

    /**
     * Returns the counterpart of the argument. For `subtype`, it returns `supertype` and vice versa.
     */
    export function flip(type: TypeHierarchyType): TypeHierarchyType {
        switch (type) {
            case TypeHierarchyType.SUBTYPE: return TypeHierarchyType.SUPERTYPE;
            case TypeHierarchyType.SUPERTYPE: return TypeHierarchyType.SUBTYPE;
            default: throw new Error(`Unexpected type hierarchy type: ${type}.`);
        }
    }

}

/**
 * Text document feature for supertype hierarchies.
 */
export class SuperTypeHierarchyFeature extends TypeHierarchyFeature {

    constructor(readonly client: ILanguageClient & Readonly<{ languageId: string }>) {
        super(client, TypeHierarchyType.SUPERTYPE, SuperTypesRequest.type);
    }

}

/**
 * Text document feature for subtype hierarchies.
 */
export class SubTypeHierarchyFeature extends TypeHierarchyFeature {

    constructor(readonly client: ILanguageClient & Readonly<{ languageId: string }>) {
        super(client, TypeHierarchyType.SUBTYPE, SubTypesRequest.type);
    }

}

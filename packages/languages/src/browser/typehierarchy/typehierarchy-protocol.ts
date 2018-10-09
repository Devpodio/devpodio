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

import { RequestType, TextDocumentPositionParams, DocumentSymbol } from '../index';

// NOTE: This module can be removed, once the type hierarchy will become the part of the LSP.
// https://github.com/Microsoft/language-server-protocol/issues/582
// https://github.com/Microsoft/vscode-languageserver-node/pull/346#discussion_r221659062

/**
 * Yet another document symbol with a `DocumentUri` `string`.
 */
export interface DocumentSymbolExt extends DocumentSymbol {

    /**
     * The URI of the text document this symbol belongs to.
     *
     * If not defined, it can be inferred from the context of the request. For example, when calling the `textDocument/documentSymbol`
     * method, the `DocumentUri` (`string`) can be inferred from the request parameter: `DocumentSymbolParams.textDocument.uri`.
     */
    readonly uri: string;

}

export namespace DocumentSymbolExt {

    /**
     * Type-guard for `DocumentSymbol`s with an additional `uri` property.
     */
    export function is(symbol: DocumentSymbol | undefined): symbol is DocumentSymbolExt {
        // tslint:disable-next-line:no-any
        return !!symbol && 'uri' in symbol && typeof (symbol as any)['uri'] === 'string';
    }

}

/**
 * The RPC message type for super- and subtype requests.
 */
export type TypeHierarchyMessageType = RequestType<TextDocumentPositionParams, DocumentSymbol | undefined, void, void>;

/**
 * The `textDocument/subTypes` request is sent from the client to the server to collect subtype information for a type under the given `TextDocumentPositionParams`.
 * If no symbols can be found under the given position, returns with `undefined`.
 */
export namespace SubTypesRequest {
    export const type: TypeHierarchyMessageType = new RequestType<TextDocumentPositionParams, DocumentSymbol | undefined, void, void>('textDocument/subTypes');
}

/**
 * The `textDocument/super` request is sent from the client to the server to collect supertype information for a type under the given `TextDocumentPositionParams`.
 * If no symbols can be found under the given position, returns with `undefined`.
 */
export namespace SuperTypesRequest {
    export const type: TypeHierarchyMessageType = new RequestType<TextDocumentPositionParams, DocumentSymbol | undefined, void, void>('textDocument/superTypes');
}

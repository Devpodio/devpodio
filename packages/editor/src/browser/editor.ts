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

import { Position, Range } from 'vscode-languageserver-types';
import * as lsp from 'vscode-languageserver-types';
import URI from '@devpodio/core/lib/common/uri';
import { Event, Disposable } from '@devpodio/core/lib/common';
import { Saveable } from '@devpodio/core/lib/browser';
import { EditorDecoration } from './decorations';

export {
    Position, Range
};

export const TextEditorProvider = Symbol('TextEditorProvider');
export type TextEditorProvider = (uri: URI) => Promise<TextEditor>;

export interface TextEditorDocument extends lsp.TextDocument, Saveable, Disposable {
    getLineContent(lineNumber: number): string;
    getLineMaxColumn(lineNumber: number): number;
}

export interface TextDocumentContentChangeDelta extends lsp.TextDocumentContentChangeEvent {
    readonly range: Range;
    readonly rangeLength: number;
}

export namespace TextDocumentContentChangeDelta {

    // tslint:disable-next-line:no-any
    export function is(arg: any): arg is TextDocumentContentChangeDelta {
        return !!arg && typeof arg['text'] === 'string' && typeof arg['rangeLength'] === 'number' && Range.is(arg['range']);
    }

}

export interface TextDocumentChangeEvent {
    readonly document: TextEditorDocument;
    readonly contentChanges: TextDocumentContentChangeDelta[];
}

/**
 * Type of hit element with the mouse in the editor.
 * Copied from monaco editor.
 */
export enum MouseTargetType {
    /**
     * Mouse is on top of an unknown element.
     */
    UNKNOWN = 0,
    /**
     * Mouse is on top of the textarea used for input.
     */
    TEXTAREA = 1,
    /**
     * Mouse is on top of the glyph margin
     */
    GUTTER_GLYPH_MARGIN = 2,
    /**
     * Mouse is on top of the line numbers
     */
    GUTTER_LINE_NUMBERS = 3,
    /**
     * Mouse is on top of the line decorations
     */
    GUTTER_LINE_DECORATIONS = 4,
    /**
     * Mouse is on top of the whitespace left in the gutter by a view zone.
     */
    GUTTER_VIEW_ZONE = 5,
    /**
     * Mouse is on top of text in the content.
     */
    CONTENT_TEXT = 6,
    /**
     * Mouse is on top of empty space in the content (e.g. after line text or below last line)
     */
    CONTENT_EMPTY = 7,
    /**
     * Mouse is on top of a view zone in the content.
     */
    CONTENT_VIEW_ZONE = 8,
    /**
     * Mouse is on top of a content widget.
     */
    CONTENT_WIDGET = 9,
    /**
     * Mouse is on top of the decorations overview ruler.
     */
    OVERVIEW_RULER = 10,
    /**
     * Mouse is on top of a scrollbar.
     */
    SCROLLBAR = 11,
    /**
     * Mouse is on top of an overlay widget.
     */
    OVERLAY_WIDGET = 12,
    /**
     * Mouse is outside of the editor.
     */
    OUTSIDE_EDITOR = 13,
}

export interface MouseTarget {
    /**
     * The target element
     */
    readonly element: Element;
    /**
     * The target type
     */
    readonly type: MouseTargetType;
    /**
     * The 'approximate' editor position
     */
    readonly position?: Position;
    /**
     * Desired mouse column (e.g. when position.column gets clamped to text length -- clicking after text on a line).
     */
    readonly mouseColumn: number;
    /**
     * The 'approximate' editor range
     */
    readonly range?: Range;
    /**
     * Some extra detail.
     */
    // tslint:disable-next-line:no-any
    readonly detail: any;
}

export interface EditorMouseEvent {
    readonly event: MouseEvent;
    readonly target: MouseTarget;
}

export interface TextEditor extends Disposable, TextEditorSelection {
    readonly node: HTMLElement;

    readonly uri: URI;
    readonly document: TextEditorDocument;
    readonly onDocumentContentChanged: Event<TextDocumentChangeEvent>;

    cursor: Position;
    readonly onCursorPositionChanged: Event<Position>;

    selection: Range;
    readonly onSelectionChanged: Event<Range>;

    focus(): void;
    blur(): void;
    isFocused(): boolean;
    readonly onFocusChanged: Event<boolean>;

    readonly onMouseDown: Event<EditorMouseEvent>;

    revealPosition(position: Position, options?: RevealPositionOptions): void;
    revealRange(range: Range, options?: RevealRangeOptions): void;

    /**
     * Rerender the editor.
     */
    refresh(): void;
    /**
     * Resize the editor to fit its node.
     */
    resizeToFit(): void;
    setSize(size: Dimension): void;

    /**
     * Applies given new decorations, and removes old decorations identified by ids.
     *
     * @returns identifiers of applied decorations, which can be removed in next call.
     */
    deltaDecorations(params: DeltaDecorationParams): string[];

    /**
     * Gets all the decorations for the lines between `startLineNumber` and `endLineNumber` as an array.
     * @param startLineNumber The start line number.
     * @param endLineNumber The end line number.
     * @return An array with the decorations.
     */
    getLinesDecorations(startLineNumber: number, endLineNumber: number): EditorDecoration[];

    getVisibleColumn(position: Position): number;

    /**
     * Replaces the text of source given in ReplaceTextParams.
     * @param params: ReplaceTextParams
     */
    replaceText(params: ReplaceTextParams): Promise<boolean>;

    /**
     * Execute edits on the editor.
     * @param edits: edits created with `lsp.TextEdit.replace`, `lsp.TextEdit.insert`, `lsp.TextEdit.del`
     */
    executeEdits(edits: lsp.TextEdit[]): boolean;

    storeViewState(): object;
    restoreViewState(state: object): void;

    detectLanguage(): void;
    setLanguage(languageId: string): void;
    readonly onLanguageChanged: Event<string>;
}

export interface Dimension {
    width: number;
    height: number;
}

export interface TextEditorSelection {
    uri: URI
    cursor?: Position
    selection?: Range
}

export interface RevealPositionOptions {
    vertical: 'auto' | 'center' | 'centerIfOutsideViewport';
    horizontal?: boolean;
}

export interface RevealRangeOptions {
    at: 'auto' | 'center' | 'top' | 'centerIfOutsideViewport';
}

export interface DeltaDecorationParams {
    oldDecorations: string[];
    newDecorations: EditorDecoration[];
}

export interface ReplaceTextParams {
    /**
     * the source to edit
     */
    source: string;
    /**
     * the replace operations
     */
    replaceOperations: ReplaceOperation[];
}

export interface ReplaceOperation {
    /**
     * the position that shall be replaced
     */
    range: Range;
    /**
     * the text to replace with
     */
    text: string;
}

export namespace TextEditorSelection {
    // tslint:disable-next-line:no-any
    export function is(e: any): e is TextEditorSelection {
        return e && e['uri'] instanceof URI;
    }
}

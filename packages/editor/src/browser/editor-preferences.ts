/********************************************************************************
 * Copyright (C) 2018 Ericsson and others.
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

import { interfaces } from 'inversify';
import {
    createPreferenceProxy,
    PreferenceProxy,
    PreferenceService,
    PreferenceContribution,
    PreferenceSchema,
    PreferenceChangeEvent
} from '@theia/core/lib/browser/preferences';
import { isWindows, isOSX } from '@theia/core/lib/common/os';

const DEFAULT_WINDOWS_FONT_FAMILY = 'Consolas, \'Courier New\', monospace';
const DEFAULT_MAC_FONT_FAMILY = 'Menlo, Monaco, \'Courier New\', monospace';
const DEFAULT_LINUX_FONT_FAMILY = '\'Droid Sans Mono\', \'monospace\', monospace, \'Droid Sans Fallback\'';

export const EDITOR_FONT_DEFAULTS = {
    fontFamily: (
        isOSX ? DEFAULT_MAC_FONT_FAMILY : (isWindows ? DEFAULT_WINDOWS_FONT_FAMILY : DEFAULT_LINUX_FONT_FAMILY)
    ),
    fontWeight: 'normal',
    fontSize: (
        isOSX ? 12 : 14
    ),
    lineHeight: 0,
    letterSpacing: 0,
};

export const editorPreferenceSchema: PreferenceSchema = {
    'type': 'object',
    'scope': 'resource',
    'overridable': true,
    'properties': {
        'editor.tabSize': {
            'type': 'number',
            'minimum': 1,
            'default': 4,
            'description': 'Configure the tab size in the editor.'
        },
        'editor.fontSize': {
            'type': 'number',
            'default': EDITOR_FONT_DEFAULTS.fontSize,
            'description': 'Configure the editor font size.'
        },
        'editor.fontFamily': {
            'type': 'string',
            'default': EDITOR_FONT_DEFAULTS.fontFamily,
            'description': 'Controls the font family.'
        },
        'editor.lineHeight': {
            'type': 'number',
            'default': EDITOR_FONT_DEFAULTS.lineHeight,
            'description': 'Controls the line height. Use 0 to compute the line height from the font size.'
        },
        'editor.letterSpacing': {
            'type': 'number',
            'default': EDITOR_FONT_DEFAULTS.letterSpacing,
            'description': 'Controls the letter spacing in pixels.'
        },
        'editor.lineNumbers': {
            'enum': [
                'on',
                'off',
                'relative',
                'interval'
            ],
            'default': 'on',
            'description': 'Control the rendering of line numbers.'
        },
        'editor.renderWhitespace': {
            'enum': [
                'none',
                'boundary',
                'all'
            ],
            'default': 'none',
            'description': 'Control the rendering of whitespaces in the editor.'
        },
        'editor.autoSave': {
            'enum': [
                'on',
                'off'
            ],
            'default': 'on',
            'description': 'Configure whether the editor should be auto saved.',
            overridable: false
        },
        'editor.autoSaveDelay': {
            'type': 'number',
            'default': 500,
            'description': 'Configure the auto save delay in milliseconds.',
            overridable: false
        },
        'editor.rulers': {
            'type': 'array',
            'default': [],
            'description': 'Render vertical lines at the specified columns.'
        },
        'editor.wordSeparators': {
            'type': 'string',
            'default': "`~!@#$%^&*()-=+[{]}\\|;:'\",.<>/",
            'description': 'A string containing the word separators used when doing word navigation.'
        },
        'editor.glyphMargin': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable the rendering of the glyph margin.'
        },
        'editor.roundedSelection': {
            'type': 'boolean',
            'default': true,
            'description': 'Render the editor selection with rounded borders.'
        },
        'editor.minimap.enabled': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable or disable the minimap.'
        },
        'editor.minimap.showSlider': {
            'enum': [
                'mouseover',
                'always'
            ],
            'default': 'mouseover',
            'description': 'Controls whether the minimap slider is automatically hidden.'
        },
        'editor.minimap.renderCharacters': {
            'type': 'boolean',
            'default': true,
            'description': 'Render the actual characters on a line (as opposed to color blocks).'
        },
        'editor.minimap.maxColumn': {
            'type': 'number',
            'default': 120,
            'description': 'Limit the width of the minimap to render at most a certain number of columns.'
        },
        'editor.minimap.side': {
            'enum': [
                'right',
                'left'
            ],
            'default': 'right',
            'description': 'Control the side of the minimap in editor.'
        },
        'editor.overviewRulerLanes': {
            'type': 'number',
            'default': 2,
            'description': 'The number of vertical lanes the overview ruler should render.'
        },
        'editor.overviewRulerBorder': {
            'type': 'boolean',
            'default': true,
            'description': 'Controls if a border should be drawn around the overview ruler.'
        },
        'editor.cursorBlinking': {
            'enum': [
                'blink',
                'smooth',
                'phase',
                'expand',
                'solid'
            ],
            'default': 'blink',
            'description': "Control the cursor animation style, possible values are 'blink', 'smooth', 'phase', 'expand' and 'solid'."
        },
        'editor.mouseWheelZoom': {
            'type': 'boolean',
            'default': false,
            'description': 'Zoom the font in the editor when using the mouse wheel in combination with holding Ctrl.'
        },
        'editor.cursorStyle': {
            'enum': [
                'line',
                'block'
            ],
            'default': 'line',
            'description': "Control the cursor style, either 'block' or 'line'."
        },
        'editor.fontLigatures': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable font ligatures.'
        },
        'editor.hideCursorInOverviewRuler': {
            'type': 'boolean',
            'default': false,
            'description': 'Should the cursor be hidden in the overview ruler.'
        },
        'editor.scrollBeyondLastLine': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable that scrolling can go one screen size after the last line.'
        },
        'editor.wordWrap': {
            'enum': [
                'off',
                'on',
                'wordWrapColumn',
                'bounded'
            ],
            'default': 'off',
            'description': 'Control the wrapping of the editor.'
        },
        'editor.wordWrapColumn': {
            'type': 'number',
            'default': 80,
            'description': 'Control the wrapping of the editor.'
        },
        'editor.wrappingIndent': {
            'enum': [
                'same',
                'indent',
                'deepIndent',
                'none'
            ],
            'default': 'same',
            'description': 'Control indentation of wrapped lines.'
        },
        'editor.links': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable detecting links and making them clickable.'
        },
        'editor.mouseWheelScrollSensitivity': {
            'type': 'number',
            'default': 1,
            'description': 'A multiplier to be used on the `deltaX` and `deltaY` of mouse wheel scroll events.'
        },
        'editor.multiCursorModifier': {
            'enum': [
                'alt',
                'ctrlCmd'
            ],
            'default': 'alt',
            'description': 'The modifier to be used to add multiple cursors with the mouse.'
        },
        'editor.accessibilitySupport': {
            'enum': [
                'auto',
                'on',
                'off'
            ],
            'default': 'auto',
            'description': "Configure the editor's accessibility support."
        },
        'editor.quickSuggestions': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable quick suggestions (shadow suggestions).'
        },
        'editor.quickSuggestionsDelay': {
            'type': 'number',
            'default': 500,
            'description': 'Quick suggestions show delay (in ms).'
        },
        'editor.parameterHints': {
            'type': 'boolean',
            'default': true,
            'description': 'Enables parameter hints.'
        },
        'editor.autoClosingBrackets': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable auto closing brackets.'
        },
        'editor.autoIndent': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable auto indentation adjustment.'
        },
        'editor.formatOnSave': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable format on manual save.'
        },
        'editor.formatOnType': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable format on type.'
        },
        'editor.formatOnPaste': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable format on paste.'
        },
        'editor.dragAndDrop': {
            'type': 'boolean',
            'default': false,
            'description': 'Controls if the editor should allow to move selections via drag and drop.'
        },
        'editor.suggestOnTriggerCharacters': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable the suggestion box to pop-up on trigger characters.'
        },
        'editor.acceptSuggestionOnEnter': {
            'enum': [
                'on',
                'smart',
                'off'
            ],
            'default': 'on',
            'description': 'Accept suggestions on ENTER.'
        },
        'editor.acceptSuggestionOnCommitCharacter': {
            'type': 'boolean',
            'default': true,
            'description': 'Accept suggestions on provider defined characters.'
        },
        'editor.snippetSuggestions': {
            'enum': [
                'inline',
                'top',
                'bottom',
                'none'
            ],
            'default': 'inline',
            'description': 'Enable snippet suggestions.'
        },
        'editor.emptySelectionClipboard': {
            'type': 'boolean',
            'default': true,
            'description': 'Copying without a selection copies the current line.'
        },
        'editor.wordBasedSuggestions': {
            'type': 'boolean',
            'default': true,
            'description': "Enable word based suggestions. Defaults to 'true'."
        },
        'editor.selectionHighlight': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable selection highlight.'
        },
        'editor.occurrencesHighlight': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable semantic occurrences highlight.'
        },
        'editor.codeLens': {
            'type': 'boolean',
            'default': true,
            'description': 'Show code lens.'
        },
        'editor.folding': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable code folding.'
        },
        'editor.foldingStrategy': {
            'enum': [
                'auto',
                'indentation'
            ],
            'default': 'auto',
            'description': 'Selects the folding strategy.'
                + '\'auto\' uses the strategies contributed for the current document, \'indentation\' uses the indentation based folding strategy. '
        },
        'editor.showFoldingControls': {
            'enum': [
                'mouseover',
                'always'
            ],
            'default': 'mouseover',
            'description': 'Controls whether the fold actions in the gutter stay always visible or hide unless the mouse is over the gutter.'
        },
        'editor.matchBrackets': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable highlighting of matching brackets.'
        },
        'editor.renderControlCharacters': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable rendering of control characters.'
        },
        'editor.renderIndentGuides': {
            'type': 'boolean',
            'default': false,
            'description': 'Enable rendering of indent guides.'
        },
        'editor.renderLineHighlight': {
            'enum': [
                'all',
                'gutter',
                'line',
                'none'
            ],
            'default': 'all',
            'description': 'Enable rendering of current line highlight.'
        },
        'editor.useTabStops': {
            'type': 'boolean',
            'default': true,
            'description': 'Inserting and deleting whitespace follows tab stops.'
        },
        'editor.insertSpaces': {
            'type': 'boolean',
            'default': true,
            'description': 'Using whitespaces to replace tabs when tabbing.'
        },
        'editor.colorDecorators': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable inline color decorators and color picker rendering.'
        },
        'editor.highlightActiveIndentGuide': {
            'type': 'boolean',
            'default': true,
            'description': 'Enable highlighting of the active indent guide.'
        },
        'editor.iconsInSuggestions': {
            'type': 'boolean',
            'default': true,
            'description': 'Render icons in suggestions box.'
        },
        'editor.showUnused': {
            'type': 'boolean',
            'default': true,
            'description': 'Controls fading out of unused variables.',
        },
        'editor.scrollBeyondLastColumn': {
            'type': 'number',
            'default': 5,
            'description': 'Enable that scrolling can go beyond the last column by a number of columns.'
        },
        'editor.suggestSelection': {
            'enum': [
                'first',
                'recentlyUsed',
                'recentlyUsedByPrefix'
            ],
            'default': 'first',
            'description': 'The history mode for suggestions'
        },
        'editor.fontWeight': {
            'enum': [
                'normal',
                'bold',
                'bolder',
                'lighter',
                'initial',
                'inherit',
                '100',
                '200',
                '300',
                '400',
                '500',
                '600',
                '700',
                '800',
                '900'
            ],
            'default': EDITOR_FONT_DEFAULTS.fontWeight,
            'description': 'Controls the editor\'s font weight.'
        },
        'diffEditor.renderSideBySide': {
            'type': 'boolean',
            'description': 'Render the differences in two side-by-side editors.',
            'default': true
        },
        'diffEditor.ignoreTrimWhitespace': {
            'type': 'boolean',
            'description': 'Compute the diff by ignoring leading/trailing whitespace.',
            'default': true
        },
        'diffEditor.renderIndicators': {
            'type': 'boolean',
            'description': 'Render +/- indicators for added/deleted changes.',
            'default': true
        },
        'diffEditor.followsCaret': {
            'type': 'boolean',
            'description': 'Resets the navigator state when the user selects something in the editor.',
            'default': true
        },
        'diffEditor.ignoreCharChanges': {
            'type': 'boolean',
            'description': 'Jump from line to line.',
            'default': true
        },
        'diffEditor.alwaysRevealFirst': {
            'type': 'boolean',
            'description': 'Reveal first change.',
            'default': true
        },
        'files.eol': {
            'type': 'string',
            'enum': [
                '\n',
                '\r\n',
                'auto'
            ],
            'enumDescriptions': [
                'LF',
                'CRLF',
                'Uses operating system specific end of line character.'
            ],
            'default': 'auto',
            'description': 'The default end of line character.'
        }
    }
};

export interface EditorConfiguration {
    'editor.tabSize': number
    'editor.fontFamily': string
    'editor.fontSize': number
    'editor.fontWeight'?: 'normal' | 'bold' | 'bolder' | 'lighter' | 'initial'
    | 'inherit' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
    'editor.autoSave': 'on' | 'off'
    'editor.autoSaveDelay': number
    'editor.lineNumbers'?: 'on' | 'off'
    'editor.renderWhitespace'?: 'none' | 'boundary' | 'all'
    'editor.rulers'?: number[]
    'editor.wordSeparators'?: string
    'editor.glyphMargin'?: boolean
    'editor.roundedSelection'?: boolean
    'editor.minimap.enabled'?: boolean
    'editor.minimap.showSlider'?: 'always' | 'mouseover'
    'editor.minimap.renderCharacters'?: boolean
    'editor.minimap.maxColumn'?: number
    'editor.minimap.side'?: 'right' | 'left'
    'editor.overviewRulerLanes'?: number
    'editor.overviewRulerBorder'?: boolean
    'editor.cursorBlinking'?: 'blink' | 'smooth' | 'phase' | 'expand' | 'solid'
    'editor.mouseWheelZoom'?: boolean
    'editor.cursorStyle'?: 'line' | 'block'
    'editor.fontLigatures'?: boolean
    'editor.hideCursorInOverviewRuler'?: boolean
    'editor.scrollBeyondLastLine'?: boolean
    'editor.scrollBeyondLastColumn'?: number
    'editor.wordWrap'?: 'off' | 'on' | 'wordWrapColumn' | 'bounded'
    'editor.wordWrapColumn'?: number
    'editor.wrappingIndent'?: 'none' | 'same' | 'indent' | 'deepIndent'
    'editor.links'?: boolean
    'editor.mouseWheelScrollSensitivity'?: number
    'editor.multiCursorModifier'?: 'ctrlCmd' | 'alt'
    'editor.accessibilitySupport'?: 'auto' | 'off' | 'on'
    'editor.quickSuggestions'?: boolean
    'editor.quickSuggestionsDelay'?: number
    'editor.suggestSelection'?: 'first' | 'recentlyUsed' | 'recentlyUsedByPrefix'
    'editor.iconsInSuggestions'?: boolean
    'editor.parameterHints'?: boolean
    'editor.autoClosingBrackets'?: boolean
    'editor.autoIndent'?: boolean
    'editor.formatOnType'?: boolean
    'editor.formatOnSave'?: boolean
    'editor.formatOnPaste'?: boolean
    'editor.dragAndDrop'?: boolean
    'editor.suggestOnTriggerCharacters'?: boolean
    'editor.acceptSuggestionOnEnter'?: 'on' | 'smart' | 'off'
    'editor.acceptSuggestionOnCommitCharacter'?: boolean
    'editor.snippetSuggestions'?: 'top' | 'bottom' | 'inline' | 'none'
    'editor.emptySelectionClipboard'?: boolean
    'editor.wordBasedSuggestions'?: boolean
    'editor.selectionHighlight'?: boolean
    'editor.occurrencesHighlight'?: boolean
    'editor.codeLens'?: boolean
    'editor.folding'?: boolean
    'editor.foldingStrategy'?: 'auto' | 'indentation'
    'editor.showFoldingControls'?: 'always' | 'mouseover'
    'editor.matchBrackets'?: boolean
    'editor.renderControlCharacters'?: boolean
    'editor.renderIndentGuides'?: boolean
    'editor.highlightActiveIndentGuide'?: boolean
    'editor.renderLineHighlight'?: 'none' | 'gutter' | 'line' | 'all'
    'editor.useTabStops'?: boolean
    'editor.insertSpaces': boolean
    'editor.colorDecorators'?: boolean
    'editor.showUnused'?: boolean
    'diffEditor.renderSideBySide'?: boolean
    'diffEditor.ignoreTrimWhitespace'?: boolean
    'diffEditor.renderIndicators'?: boolean
    'diffEditor.followsCaret'?: boolean
    'diffEditor.ignoreCharChanges'?: boolean
    'diffEditor.alwaysRevealFirst'?: boolean
    'files.eol': EndOfLinePreference
}
export type EndOfLinePreference = '\n' | '\r\n' | 'auto';

export type EditorPreferenceChange = PreferenceChangeEvent<EditorConfiguration>;

export const EditorPreferences = Symbol('EditorPreferences');
export type EditorPreferences = PreferenceProxy<EditorConfiguration>;

export function createEditorPreferences(preferences: PreferenceService): EditorPreferences {
    return createPreferenceProxy(preferences, editorPreferenceSchema);
}

export function bindEditorPreferences(bind: interfaces.Bind): void {
    bind(EditorPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createEditorPreferences(preferences);
    }).inSingletonScope();

    bind(PreferenceContribution).toConstantValue({ schema: editorPreferenceSchema });
}

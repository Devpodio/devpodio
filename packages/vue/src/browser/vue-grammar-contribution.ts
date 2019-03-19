/********************************************************************************
 * Copyright (C) 2018 Uni Sayo and others.
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

import { LanguageGrammarDefinitionContribution, TextmateRegistry } from '@devpodio/monaco/lib/browser/textmate';
import { injectable } from 'inversify';
import { VUE_LANGUAGE_ID_HTML, VUE_LANGUAGE_NAME } from '../common';

const EMPTY_ELEMENTS: string[] = [
    'area',
    'base',
    'br',
    'col',
    'embed',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'menuitem',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
];

@injectable()
export class VueGrammarContribution implements LanguageGrammarDefinitionContribution {

    readonly scopeName = 'text.html.vue';

    registerTextmateLanguage(registry: TextmateRegistry) {
        monaco.languages.register({
            id: VUE_LANGUAGE_ID_HTML,
            extensions: ['.vue'],
            aliases: [VUE_LANGUAGE_NAME, 'vue']
        });
        monaco.languages.setLanguageConfiguration(VUE_LANGUAGE_ID_HTML, {
            wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,
            onEnterRules: [
                {
                    beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))([_:\\w][_:\\w-.\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
                    afterText: /^<\/([_:\w][_:\w-.\d]*)\s*>$/i,
                    action: { indentAction: monaco.languages.IndentAction.IndentOutdent }
                },
                {
                    beforeText: new RegExp(`<(?!(?:${EMPTY_ELEMENTS.join('|')}))(\\w[\\w\\d]*)([^/>]*(?!/)>)[^<]*$`, 'i'),
                    action: { indentAction: monaco.languages.IndentAction.Indent }
                }
            ]
        });
        const grammar = require('../../data/vue.tmLanguage.json');
        registry.registerTextmateGrammarScope(this.scopeName, {
            async getGrammarDefinition() {
                return {
                    format: 'json',
                    content: grammar
                };
            }
        });
        registry.mapLanguageIdToTextmateGrammar(VUE_LANGUAGE_ID_HTML, this.scopeName);
    }
}

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
import { VUE_LANGUAGE_ID, VUE_LANGUAGE_NAME } from '../common';

@injectable()
export class VueGrammarContribution implements LanguageGrammarDefinitionContribution {

    readonly scopeName = 'text.html.vue';

    registerTextmateLanguage(registry: TextmateRegistry) {
        monaco.languages.register({
            id: VUE_LANGUAGE_ID,
            extensions: ['.vue'],
            aliases: [VUE_LANGUAGE_NAME, 'vue']
        });
        monaco.languages.setLanguageConfiguration(VUE_LANGUAGE_ID, {
            wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\$\^\&\*\(\)\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\s]+)/g,

            comments: {
                lineComment: '//',
                blockComment: ['/*', '*/']
            },

            brackets: [
                ['<', '>'],
                ['{', '}'],
                ['(', ')']
            ],

            autoClosingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
                { open: '\'', close: '\'' }
            ],

            surroundingPairs: [
                { open: '"', close: '"' },
                { open: '\'', close: '\'' },
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '<', close: '>' },
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
        registry.mapLanguageIdToTextmateGrammar(VUE_LANGUAGE_ID, this.scopeName);
    }
}

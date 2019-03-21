/********************************************************************************
 * Copyright (C) 2019 Uni Sayo and others.
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

@injectable()
export class ScssContribution implements LanguageGrammarDefinitionContribution {

    readonly id = 'sass';
    readonly scopeName = 'source.sass';

    registerTextmateLanguage(registry: TextmateRegistry) {
        monaco.languages.register({
            id: this.id,
            extensions: ['.sass'],
            aliases: ['Sass', 'sass']
        });
        monaco.languages.setLanguageConfiguration(this.id, {
            wordPattern: /(#?-?\d*\.\d\w*%?)|([@#!.:]?[\w-?]+%?)|[@#!.]/g,
            comments: {
                blockComment: ['/*', '*/'],
                lineComment: '//'
            },
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')'],
            ],
            autoClosingPairs: [
                { open: '{', close: '}', notIn: ['string', 'comment'] },
                { open: '[', close: ']', notIn: ['string', 'comment'] },
                { open: '(', close: ')', notIn: ['string', 'comment'] },
                { open: '"', close: '"', notIn: ['string', 'comment'] },
                { open: '\'', close: '\'', notIn: ['string', 'comment'] },
            ],
            surroundingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
                { open: '\'', close: '\'' },
            ],
            folding: {
                markers: {
                    start: new RegExp('^\\s*\\/\\*\\s*#region\\b\\s*(.*?)\\s*\\*\\/'),
                    end: new RegExp('^\\s*\\/\\*\\s*#endregion\\b.*\\*\\/')
                }
            }
        });

        const grammar = require('../../data/sass.tmLanguage.json');
        registry.registerTextmateGrammarScope(this.scopeName, {
            async getGrammarDefinition() {
                return {
                    format: 'json',
                    content: grammar
                };
            }
        });
        registry.mapLanguageIdToTextmateGrammar(this.id, this.scopeName);
    }
}

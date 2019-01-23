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

import { LanguageGrammarDefinitionContribution, TextmateRegistry } from '@devpodio/monaco/lib/browser/textmate';
import { injectable } from 'inversify';

@injectable()
export class BatContribution implements LanguageGrammarDefinitionContribution {

    readonly id = 'bat';
    readonly scopeName = 'source.batchfile';

    registerTextmateLanguage(registry: TextmateRegistry) {
        monaco.languages.register({
            id: this.id,
            extensions: ['.bat', '.cmd'],
            aliases: ['Batch', 'bat']
        });
        monaco.languages.setLanguageConfiguration(this.id, {
            comments: {
                lineComment: 'REM'
            },
            brackets: [
                ['{', '}'],
                ['[', ']'],
                ['(', ')']
            ],
            autoClosingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
            ],
            surroundingPairs: [
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '"', close: '"' },
            ],
            folding: {
                markers: {
                    start: new RegExp('^\\s*(::\\s*|REM\\s+)#region'),
                    end: new RegExp('^\\s*(::\\s*|REM\\s+)#endregion')
                }
            }
        });
        const grammar = require('../../data/bat.tmLanguage.json');
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

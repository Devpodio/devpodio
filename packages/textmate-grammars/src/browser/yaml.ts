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
export class YamlContribution implements LanguageGrammarDefinitionContribution {

    readonly id = 'yaml';
    readonly scopeName = 'source.yaml';

    registerTextmateLanguage(registry: TextmateRegistry) {
        monaco.languages.register({
            id: this.id,
            aliases: [
                'YAML',
                'yaml'
            ],
            extensions: [
                '.yml',
                '.eyaml',
                '.eyml',
                '.yaml'
            ],
            filenames: [],
            firstLine: '^#cloud-config'
        });

        monaco.languages.setLanguageConfiguration(this.id, {
            comments: {
                lineComment: '#'
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
                { open: '\'', close: '\'' },
                { open: '"', close: '"' }
            ],
            surroundingPairs: [
                { open: '{', close: '}' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '\'', close: '\'' },
                { open: '"', close: '"' }
            ],
            indentationRules: {
                increaseIndentPattern: new RegExp('^\\s*.*(:|-) ?(&amp;\\w+)?(\\{[^}"\']*|\\([^)"\']*)?$'),
                decreaseIndentPattern: new RegExp('^\\s+\\}$')
            }
        });
        const yamlGrammar = require('../../data/yaml.tmLanguage.json');
        registry.registerTextmateGrammarScope(this.scopeName, {
            async getGrammarDefinition() {
                return {
                    format: 'json',
                    content: yamlGrammar
                };
            }
        });

        registry.mapLanguageIdToTextmateGrammar(this.id, this.scopeName);
    }
}

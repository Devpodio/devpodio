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

import { LanguageGrammarDefinitionContribution, TextmateRegistry } from '@devpodio/monaco/lib/browser/textmate';
import { injectable } from 'inversify';

@injectable()
export class TclContribution implements LanguageGrammarDefinitionContribution {

    readonly id = 'tcl';
    readonly scopeName = 'source.tcl';

    registerTextmateLanguage(registry: TextmateRegistry) {
        monaco.languages.register({
            id: this.id,
            aliases: ['TCL', 'tcl', 'Tcl'],
            // .exp are Expect files, which are written in TCL.
            extensions: ['.tcl', '.exp'],
        });
        const grammar = require('../../data/Tcl.plist');
        registry.registerTextmateGrammarScope(this.scopeName, {
            async getGrammarDefinition() {
                const grammarResponse: Response = await fetch(grammar);
                const grammarText: string = await grammarResponse.text();
                return {
                    format: 'plist',
                    content: grammarText,
                };
            }
        });
        registry.mapLanguageIdToTextmateGrammar(this.id, this.scopeName);
    }
}

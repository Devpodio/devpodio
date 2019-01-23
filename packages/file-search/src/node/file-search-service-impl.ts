/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
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

import * as readline from 'readline';
import * as fuzzy from 'fuzzy';
import { injectable, inject } from 'inversify';
import { FileSearchService } from '../common/file-search-service';
import { RawProcessFactory } from '@devpodio/process/lib/node';
import { rgPath } from 'vscode-ripgrep';
import { Deferred } from '@devpodio/core/lib/common/promise-util';
import { FileUri } from '@devpodio/core/lib/node/file-uri';
import { CancellationToken, ILogger } from '@devpodio/core';

@injectable()
export class FileSearchServiceImpl implements FileSearchService {

    constructor(
        @inject(ILogger) protected readonly logger: ILogger,
        @inject(RawProcessFactory) protected readonly rawProcessFactory: RawProcessFactory) { }

    async find(searchPattern: string, options: FileSearchService.Options, cancellationToken?: CancellationToken): Promise<string[]> {
        const opts = {
            fuzzyMatch: true,
            limit: Number.MAX_SAFE_INTEGER,
            useGitIgnore: true,
            defaultIgnorePatterns: [
                '^.git$'
            ],
            ...options
        };
        const args: string[] = [
            '--files',
            '--sort-files',
        ];
        if (!options.useGitIgnore) {
            args.push('-uu');
        }
        const process = this.rawProcessFactory({
            command: rgPath,
            args: [...args, ...opts.rootUris.map(r => FileUri.fsPath(r))]
        });
        const result: string[] = [];
        const fuzzyMatches: string[] = [];
        const resultDeferred = new Deferred<string[]>();
        if (cancellationToken) {
            const cancel = () => {
                this.logger.debug('Search cancelled');
                process.kill();
                resultDeferred.resolve([]);
            };
            if (cancellationToken.isCancellationRequested) {
                cancel();
            } else {
                cancellationToken.onCancellationRequested(cancel);
            }
        }
        const lineReader = readline.createInterface({
            input: process.output,
            output: process.input
        });
        lineReader.on('line', line => {
            if (result.length >= opts.limit) {
                process.kill();
            } else {
                const fileUriStr = FileUri.create(line).toString();
                if (line.toLocaleLowerCase().indexOf(searchPattern.toLocaleLowerCase()) !== -1) {
                    result.push(fileUriStr);
                } else if (opts.fuzzyMatch && fuzzy.test(searchPattern, line)) {
                    fuzzyMatches.push(fileUriStr);
                }
            }
        });
        process.onError(e => {
            resultDeferred.reject(e);
        });
        process.onExit(e => {
            const left = opts.limit - result.length;
            result.push(...fuzzyMatches.slice(0, Math.min(left, fuzzyMatches.length)));
            resultDeferred.resolve(result);
        });
        return resultDeferred.promise;
    }

}

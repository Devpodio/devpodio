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

import { interfaces } from 'inversify';
import { createPreferenceProxy, PreferenceProxy, PreferenceService, PreferenceContribution, PreferenceSchema } from '@devpodio/core/lib/browser';

export interface SemanticEmojiList {
    chore: string;
    docs: string;
    feat: string;
    fix: string;
    perf: string;
    refactor: string;
    style: string;
    test: string;
    deps: string;
    [property: string]: string;
}
export const GitConfigSchema: PreferenceSchema = {
    'type': 'object',
    'properties': {
        'git.decorations.enabled': {
            'type': 'boolean',
            'description': 'Show Git file status in the navigator.',
            'default': true
        },
        'git.decorations.colors': {
            'type': 'boolean',
            'description': 'Use color decoration in the navigator.',
            'default': false
        },
        'git.editor.decorations.enabled': {
            'type': 'boolean',
            'description': 'Show git decorations in the editor.',
            'default': true
        },
        'git.editor.dirtyDiff.linesLimit': {
            'type': 'number',
            'description': 'Do not show dirty diff decorations, if editor\'s line count exceeds this limit.',
            'default': 1000
        },
        'git.commit.semantic.enabled': {
            'type': 'boolean',
            'description': 'Enables semantic commit messages',
            'default': true
        },
        'git.commit.semantic.types': {
            'type': 'array',
            'description': 'List of semantic types',
            'minItems': 1,
            'default': ['chore', 'feat', 'fix', 'docs', 'refactor', 'perf', 'style', 'test', 'deps']
        },
        'git.commit.semantic.emoji.enabled': {
            'type': 'boolean',
            'description': 'List of semantic types',
            'default': true
        },
        'git.commit.semantic.emoji.list': {
            'type': 'object',
            'description': 'List of emojis for semantic commits',
            'default': {
                'chore': ':wrench:',
                'docs': ':memo:',
                'feat': ':sparkles:',
                'fix': ':wrench:',
                'perf': ':zapr:',
                'refactor': ':hammer:',
                'style': ':art:',
                'test': ':white_check_mark:',
                'deps': ':robot:'
            },
            'properties': {
                'chore': {
                    'type': 'string',
                    'default': ':wrench:',
                    'description': 'Emoji for chore'
                },
                'docs': {
                    'type': 'string',
                    'default': ':memo:',
                    'description': 'Emoji for docs'
                },
                'feat': {
                    'type': 'string',
                    'default': ':sparkles:',
                    'description': 'Emoji for feat'
                },
                'fix': {
                    'type': 'string',
                    'default': ':wrench:',
                    'description': 'Emoji for fix'
                },
                'perf': {
                    'type': 'string',
                    'default': ':zapr:',
                    'description': 'Emoji for perf'
                },
                'refactor': {
                    'type': 'string',
                    'default': ':hammer:',
                    'description': 'Emoji for refactor'
                },
                'style': {
                    'type': 'string',
                    'default': ':art:',
                    'description': 'Emoji for style'
                },
                'test': {
                    'type': 'string',
                    'default': ':white_check_mark:',
                    'description': 'Emoji for test'
                },
                'deps': {
                    'type': 'string',
                    'default': ':robot:',
                    'description': 'Emoji for deps'
                }
            }
        }
    }
};

export interface GitConfiguration {
    'git.decorations.enabled': boolean,
    'git.decorations.colors': boolean,
    'git.editor.decorations.enabled': boolean,
    'git.editor.dirtyDiff.linesLimit': number,
    'git.commit.semantic.types': string[],
    'git.commit.semantic.enabled': boolean,
    'git.commit.semantic.emoji.enabled': boolean,
    'git.commit.semantic.emoji.list': SemanticEmojiList
}

export const GitPreferences = Symbol('GitPreferences');
export type GitPreferences = PreferenceProxy<GitConfiguration>;

export function createGitPreferences(preferences: PreferenceService): GitPreferences {
    return createPreferenceProxy(preferences, GitConfigSchema);
}

export function bindGitPreferences(bind: interfaces.Bind): void {
    bind(GitPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createGitPreferences(preferences);
    });
    bind(PreferenceContribution).toConstantValue({ schema: GitConfigSchema });
}

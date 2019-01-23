/********************************************************************************
 * Copyright (C) 2018 Red Hat, Inc. and others.
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

import { DebugExt, } from '../../../api/plugin-api';
import { DebugConfiguration } from '@devpodio/debug/lib/common/debug-configuration';
import { IJSONSchemaSnippet, IJSONSchema } from '@devpodio/core/lib/common/json-schema';
import { MaybePromise } from '@devpodio/core/lib/common/types';
import { DebuggerDescription } from '@devpodio/debug/lib/common/debug-service';

/**
 * Plugin [DebugAdapterContribution](#DebugAdapterContribution).
 */
export class PluginDebugAdapterContribution {
    constructor(
        protected readonly description: DebuggerDescription,
        protected readonly debugExt: DebugExt) { }

    get type(): string {
        return this.description.type;
    }

    get label(): MaybePromise<string | undefined> {
        return this.description.label;
    }

    get languages(): MaybePromise<string[] | undefined> {
        return this.debugExt.$getSupportedLanguages(this.type);
    }

    async getSchemaAttributes(): Promise<IJSONSchema[]> {
        return this.debugExt.$getSchemaAttributes(this.type);
    }

    async getConfigurationSnippets(): Promise<IJSONSchemaSnippet[]> {
        return this.debugExt.$getConfigurationSnippets(this.type);
    }

    async provideDebugConfigurations(workspaceFolderUri: string | undefined): Promise<DebugConfiguration[]> {
        return this.debugExt.$provideDebugConfigurations(this.type, workspaceFolderUri);
    }

    async resolveDebugConfiguration(config: DebugConfiguration, workspaceFolderUri: string | undefined): Promise<DebugConfiguration | undefined> {
        return this.debugExt.$resolveDebugConfigurations(config, workspaceFolderUri);
    }

    async createDebugSession(config: DebugConfiguration): Promise<string> {
        return this.debugExt.$createDebugSession(config);
    }

    async terminateDebugSession(sessionId: string): Promise<void> {
        this.debugExt.$terminateDebugSession(sessionId);
    }
}

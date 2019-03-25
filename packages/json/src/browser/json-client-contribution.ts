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

import { injectable, inject } from 'inversify';
import {
    BaseLanguageClientContribution,
    Workspace,
    Languages,
    LanguageClientFactory,
    ILanguageClient,
    DocumentSelector
} from '@devpodio/languages/lib/browser';
import { JSON_LANGUAGE_ID, JSON_LANGUAGE_NAME, JSONC_LANGUAGE_ID } from '../common';
import { ResourceProvider } from '@devpodio/core';
import URI from '@devpodio/core/lib/common/uri';
import { JsonPreferences } from './json-preferences';
import { JsonSchemaStore } from '@devpodio/core/lib/browser/json-schema-store';
import { Endpoint } from '@devpodio/core/lib/browser';

@injectable()
export class JsonClientContribution extends BaseLanguageClientContribution {

    readonly id = JSON_LANGUAGE_ID;
    readonly name = JSON_LANGUAGE_NAME;

    constructor(
        @inject(Workspace) protected readonly workspace: Workspace,
        @inject(ResourceProvider) protected readonly resourceProvider: ResourceProvider,
        @inject(Languages) protected readonly languages: Languages,
        @inject(LanguageClientFactory) protected readonly languageClientFactory: LanguageClientFactory,
        @inject(JsonPreferences) protected readonly preferences: JsonPreferences,
        @inject(JsonSchemaStore) protected readonly jsonSchemaStore: JsonSchemaStore
    ) {
        super(workspace, languages, languageClientFactory);
        this.initializeJsonSchemaAssociations();
        preferences.onPreferenceChanged(e => {
            if (e.preferenceName === 'json.schemas') {
                this.updateSchemas();
            }
        });
        jsonSchemaStore.onSchemasChanged(() => {
            this.updateSchemas();
        });
        this.updateSchemas();
    }

    protected async updateSchemas(): Promise<void> {
        const allConfigs = [...this.jsonSchemaStore.getJsonSchemaConfigurations()];
        const config = this.preferences['json.schemas'];
        if (config instanceof Array) {
            allConfigs.push(...config);
        }
        const registry: { [pattern: string]: string[] } = {};
        for (const s of allConfigs) {
            if (s.fileMatch) {
                for (let fileMatch of s.fileMatch) {
                    if (fileMatch.charAt(0) !== '/' && !fileMatch.match(/\w+:/)) {
                        fileMatch = '/' + fileMatch;
                    }
                    registry[fileMatch] = [s.url];
                }
            }
        }
        const client = await this.languageClient;
        client.sendNotification('json/schemaAssociations', registry);
    }

    protected get globPatterns() {
        return [
            '**/*.json',
            '**/*.jsonc',
        ];
    }

    protected get documentSelector(): DocumentSelector | undefined {
        return [this.id, JSONC_LANGUAGE_ID];
    }

    protected get configurationSection(): string[] {
        return [this.id];
    }

    protected onReady(languageClient: ILanguageClient): void {
        // handle content request
        languageClient.onRequest('vscode/content', async (uriPath: string) => {
            const uri = new URI(uriPath);
            const resource = await this.resourceProvider(uri);
            const text = await resource.readContents();
            return text;
        });
        super.onReady(languageClient);
        setTimeout(() => this.initializeJsonSchemaAssociations());
    }

    protected async initializeJsonSchemaAssociations(): Promise<void> {
        const url = `${new Endpoint().httpScheme}//schemastore.azurewebsites.net/api/json/catalog.json`;
        const response = await fetch(url);
        const schemas: SchemaData[] = (await response.json()).schemas!;
        for (const s of schemas) {
            if (s.fileMatch) {
                this.jsonSchemaStore.registerSchema({
                    fileMatch: s.fileMatch,
                    url: s.url
                });
            }
        }
    }

}

interface SchemaData {
    name: string;
    description: string;
    fileMatch?: string[];
    url: string;
    // tslint:disable-next-line:no-any
    schema: any;
}

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

import { PluginDeployerFileHandler, PluginDeployerEntry, PluginDeployerFileHandlerContext } from '@devpodio/plugin-ext';
import { injectable } from 'inversify';
import * as path from 'path';
import { getTempDir } from '@devpodio/plugin-ext';

@injectable()
export class PluginVsCodeFileHandler implements PluginDeployerFileHandler {

    private unpackedFolder: string;
    constructor() {
        this.unpackedFolder = getTempDir('vscode-unpacked');
    }

    accept(resolvedPlugin: PluginDeployerEntry): boolean {
        return resolvedPlugin.isFile() && resolvedPlugin.path() !== null && resolvedPlugin.path().endsWith('.vsix');
    }

    async handle(context: PluginDeployerFileHandlerContext): Promise<void> {
        // need to unzip
        console.log('unzipping the plugin', context.pluginEntry());

        const unpackedPath = path.resolve(this.unpackedFolder, path.basename(context.pluginEntry().path()));
        await context.unzip(context.pluginEntry().path(), unpackedPath);

        context.pluginEntry().updatePath(unpackedPath);
        return Promise.resolve();
    }
}

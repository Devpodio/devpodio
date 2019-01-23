/********************************************************************************
 * Copyright (C) 2017-2018 TypeFox and others.
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

import { ContainerModule } from 'inversify';
import { ResourceResolver } from '@devpodio/core/lib/common';
import { WebSocketConnectionProvider, FrontendApplicationContribution, ConfirmDialog } from '@devpodio/core/lib/browser';
import { FileSystem, fileSystemPath, FileShouldOverwrite, FileStat } from '../common';
import {
    fileSystemWatcherPath, FileSystemWatcherServer,
    FileSystemWatcherServerProxy, ReconnectingFileSystemWatcherServer
} from '../common/filesystem-watcher-protocol';
import { FileResourceResolver } from './file-resource';
import { bindFileSystemPreferences } from './filesystem-preferences';
import { FileSystemWatcher } from './filesystem-watcher';
import { FileSystemFrontendContribution } from './filesystem-frontend-contribution';

import '../../src/browser/style/index.css';

export default new ContainerModule(bind => {
    bindFileSystemPreferences(bind);

    bind(FileSystemWatcherServerProxy).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy(ctx.container, fileSystemWatcherPath)
    );
    bind(FileSystemWatcherServer).to(ReconnectingFileSystemWatcherServer);
    bind(FileSystemWatcher).toSelf().inSingletonScope();
    bind(FileShouldOverwrite).toFunction(async function (file: FileStat): Promise<boolean> {
        const dialog = new ConfirmDialog({
            title: `The file '${file.uri}' has been changed on the file system.`,
            msg: 'Do you want to overwrite the changes made on the file system?',
            ok: 'Yes',
            cancel: 'No'
        });
        return !!await dialog.open();
    });

    bind(FileSystem).toDynamicValue(ctx =>
        WebSocketConnectionProvider.createProxy<FileSystem>(ctx.container, fileSystemPath)
    ).inSingletonScope();

    bind(FileResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(FileResourceResolver);

    bind(FrontendApplicationContribution).to(FileSystemFrontendContribution).inSingletonScope();
});

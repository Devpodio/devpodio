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

import { enableJSDOM } from '@devpodio/core/lib/browser/test/jsdom';
const disableJSDOM = enableJSDOM();

import { expect } from 'chai';
import * as sinon from 'sinon';
import { Container } from 'inversify';
import { Signal } from '@phosphor/signaling';
import { ApplicationShell } from '@devpodio/core/lib/browser';
import { FileStat, FileSystem } from '@devpodio/filesystem/lib/common/filesystem';
import { MockFilesystem } from '@devpodio/filesystem/lib/common/test';
import { FOLDER_ICON, FILE_ICON, DefaultUriLabelProviderContribution } from '@devpodio/core/lib/browser/label-provider';
import { WorkspaceUriLabelProviderContribution } from './workspace-uri-contribution';
import URI from '@devpodio/core/lib/common/uri';
import { WorkspaceVariableContribution } from './workspace-variable-contribution';
import { WorkspaceService } from './workspace-service';

after(() => disableJSDOM());

let container: Container;
let labelProvider: WorkspaceUriLabelProviderContribution;
let roots: FileStat[];
beforeEach(() => {
    roots = [{
        uri: 'file:///workspace',
        lastModification: 0,
        isDirectory: true
    }];

    container = new Container();
    container.bind(ApplicationShell).toConstantValue({
        currentChanged: new Signal({})
    // tslint:disable-next-line:no-any
    } as any);
    const workspaceService = new WorkspaceService();
    workspaceService.tryGetRoots = () => roots;
    container.bind(WorkspaceService).toConstantValue(workspaceService);
    container.bind(WorkspaceVariableContribution).toSelf().inSingletonScope();
    container.bind(WorkspaceUriLabelProviderContribution).toSelf().inSingletonScope();
    container.bind(FileSystem).to(MockFilesystem).inSingletonScope();
    labelProvider = container.get(WorkspaceUriLabelProviderContribution);
});

afterEach(() => {
    roots = undefined!;
    labelProvider = undefined!;
    container = undefined!;
});

describe('WorkspaceUriLabelProviderContribution class', () => {
    const stubs: sinon.SinonStub[] = [];

    afterEach(() => {
        stubs.forEach(s => s.restore());
        stubs.length = 0;
    });

    describe('canHandle()', () => {
        it('should return 0 if the passed in argument is not a FileStat or URI with the "file" scheme', () => {
            expect(labelProvider.canHandle(new URI('user_storage:settings.json'))).eq(0);
            expect(labelProvider.canHandle({ uri: 'file:///home/settings.json' })).eq(0);
        });

        it('should return 10 if the passed in argument is a FileStat or URI with the "file" scheme', () => {
            expect(labelProvider.canHandle(new URI('file:///home/settings.json'))).eq(10);
            expect(labelProvider.canHandle(<FileStat>{
                uri: 'file:///home/settings.json',
                lastModification: 0,
                isDirectory: false
            })).eq(10);
        });
    });

    describe('getIcon()', () => {
        let fs: MockFilesystem;

        beforeEach(() => {
            fs = container.get<MockFilesystem>(FileSystem);
        });

        it('should return FOLDER_ICON from the FileStat of a folder', async () => {
            expect(await labelProvider.getIcon(<FileStat>{
                uri: 'file:///home/',
                lastModification: 0,
                isDirectory: true
            })).eq(FOLDER_ICON);
        });

        it('should return FILE_ICON from a non-folder FileStat', async () => {
            const stat = <FileStat>{
                uri: 'file:///home/test',
                lastModification: 0,
                isDirectory: false
            };
            stubs.push(sinon.stub(fs, 'getFileStat').resolves(stat));
            // tslint:disable-next-line:no-any
            stubs.push(sinon.stub(DefaultUriLabelProviderContribution.prototype, <any>'getFileIcon').returns(undefined));
            expect(await labelProvider.getIcon(stat)).eq(FILE_ICON);
        });

        it('should return FOLDER_ICON from a folder URI', async () => {
            stubs.push(sinon.stub(fs, 'getFileStat').resolves(<FileStat>{
                uri: 'file:///home/test',
                lastModification: 0,
                isDirectory: true
            }));
            // tslint:disable-next-line:no-any
            stubs.push(sinon.stub(DefaultUriLabelProviderContribution.prototype, <any>'getFileIcon').returns(undefined));
            expect(await labelProvider.getIcon(new URI('file:///home/test'))).eq(FOLDER_ICON);
        });

        it('should return FILE_ICON from a file URI', async () => {
            stubs.push(sinon.stub(fs, 'getFileStat').resolves(<FileStat>{
                uri: 'file:///home/test',
                lastModification: 0,
                isDirectory: false
            }));
            // tslint:disable-next-line:no-any
            stubs.push(sinon.stub(DefaultUriLabelProviderContribution.prototype, <any>'getFileIcon').returns(undefined));
            expect(await labelProvider.getIcon(new URI('file:///home/test'))).eq(FILE_ICON);
        });

        it('should return FILE_ICON from a URI when FileSystem.getFileStat() throws', async () => {
            stubs.push(sinon.stub(fs, 'getFileStat').throws(new Error()));
            expect(await labelProvider.getIcon(new URI('file:///home/test'))).eq(FILE_ICON);
        });

        it('should return what getFileIcon() returns from a URI or non-folder FileStat, if getFileIcon() does not return null or undefined', async () => {
            const ret = 'TestString';
            // tslint:disable-next-line:no-any
            stubs.push(sinon.stub(DefaultUriLabelProviderContribution.prototype, <any>'getFileIcon').returns(ret));
            expect(await labelProvider.getIcon(new URI('file:///home/test'))).eq(ret);
            expect(await labelProvider.getIcon(<FileStat>{
                uri: 'file:///home/test',
                lastModification: 0,
                isDirectory: false
            })).eq(ret);
        });
    });

    describe('getName()', () => {
        it('should return the display name of a file from its URI', () => {
            const file = new URI('file:///workspace-2/jacques.doc');
            const name = labelProvider.getName(file);
            expect(name).eq('jacques.doc');
        });

        it('should return the display name of a file from its FileStat', () => {
            const file: FileStat = {
                uri: 'file:///workspace-2/jacques.doc',
                lastModification: 0,
                isDirectory: false
            };
            const name = labelProvider.getName(file);
            expect(name).eq('jacques.doc');
        });
    });

    describe('getLongName()', () => {
        it('should return the path of a file relative to the workspace from the file\'s URI if the file is in the workspace', () => {
            const file = new URI('file:///workspace/some/very-long/path.js');
            const longName = labelProvider.getLongName(file);
            expect(longName).eq('some/very-long/path.js');
        });

        it('should return the path of a file relative to the workspace from the file\'s FileStat if the file is in the workspace', () => {
            const file: FileStat = {
                uri: 'file:///workspace/some/very-long/path.js',
                lastModification: 0,
                isDirectory: false
            };
            const longName = labelProvider.getLongName(file);
            expect(longName).eq('some/very-long/path.js');
        });

        it('should return the absolute path of a file from the file\'s URI if the file is not in the workspace', () => {
            const file = new URI('file:///tmp/prout.txt');
            const longName = labelProvider.getLongName(file);
            expect(longName).eq('/tmp/prout.txt');
        });

        it('should return the absolute path of a file from the file\'s FileStat if the file is not in the workspace', () => {
            const file: FileStat = {
                uri: 'file:///tmp/prout.txt',
                lastModification: 0,
                isDirectory: false
            };
            const longName = labelProvider.getLongName(file);
            expect(longName).eq('/tmp/prout.txt');
        });

        it('should return the path of a file if WorkspaceService returns no roots', () => {
            roots = [];
            const file = new URI('file:///tmp/prout.txt');
            const longName = labelProvider.getLongName(file);
            expect(longName).eq('/tmp/prout.txt');
        });
    });

});

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

// tslint:disable:no-any
// tslint:disable:no-unused-expression

import { enableJSDOM } from '@devpodio/core/lib/browser/test/jsdom';

let disableJSDOM = enableJSDOM();

import { Container } from 'inversify';
import * as chai from 'chai';
import * as fs from 'fs-extra';
import * as temp from 'temp';
import { Emitter } from '@devpodio/core/lib/common';
import {
    PreferenceService, PreferenceScope, PreferenceProviderDataChanges,
    PreferenceSchemaProvider, PreferenceProviderProvider, PreferenceServiceImpl, bindPreferenceSchemaProvider
} from '@theia/core/lib/browser/preferences';
import { FileSystem, FileShouldOverwrite, FileStat } from '@theia/filesystem/lib/common/';
import { FileSystemWatcher } from '@theia/filesystem/lib/browser/filesystem-watcher';
import { FileSystemWatcherServer } from '@theia/filesystem/lib/common/filesystem-watcher-protocol';
import { FileSystemPreferences, createFileSystemPreferences } from '@theia/filesystem/lib/browser/filesystem-preferences';
import { ILogger, MessageService, MessageClient } from '@theia/core';
import { UserPreferenceProvider } from './user-preference-provider';
import { WorkspacePreferenceProvider } from './workspace-preference-provider';
import { FoldersPreferencesProvider, } from './folders-preferences-provider';
import { FolderPreferenceProvider, FolderPreferenceProviderFactory, FolderPreferenceProviderOptions } from './folder-preference-provider';
import { ResourceProvider } from '@theia/core/lib/common/resource';
import { WorkspaceServer } from '@theia/workspace/lib/common/';
import { WindowService } from '@theia/core/lib/browser/window/window-service';
import { MockPreferenceProvider } from '@theia/core/lib/browser/preferences/test';
import { MockFilesystem, MockFilesystemWatcherServer } from '@theia/filesystem/lib/common/test';
import { MockLogger } from '@theia/core/lib/common/test/mock-logger';
import { MockResourceProvider } from '@theia/core/lib/common/test/mock-resource-provider';
import { MockWorkspaceServer } from '@theia/workspace/lib/common/test/mock-workspace-server';
import { MockWindowService } from '@theia/core/lib/browser/window/test/mock-window-service';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspacePreferences, createWorkspacePreferences } from '@theia/workspace/lib/browser/workspace-preferences';
import { FrontendApplicationConfigProvider } from '@theia/core/lib/browser/frontend-application-config-provider';
import * as sinon from 'sinon';
import URI from '@devpodio/core/lib/common/uri';

disableJSDOM();

const expect = chai.expect;
let testContainer: Container;

const tempPath = temp.track().openSync().path;

const mockUserPreferenceEmitter = new Emitter<PreferenceProviderDataChanges>();
const mockWorkspacePreferenceEmitter = new Emitter<PreferenceProviderDataChanges>();
const mockFolderPreferenceEmitter = new Emitter<PreferenceProviderDataChanges>();

function testContainerSetup() {
    testContainer = new Container();
    bindPreferenceSchemaProvider(testContainer.bind.bind(testContainer));

    testContainer.bind(UserPreferenceProvider).toSelf().inSingletonScope();
    testContainer.bind(WorkspacePreferenceProvider).toSelf().inSingletonScope();
    testContainer.bind(FoldersPreferencesProvider).toSelf().inSingletonScope();

    testContainer.bind(FolderPreferenceProvider).toSelf().inSingletonScope();
    testContainer.bind(FolderPreferenceProviderOptions).toConstantValue({ folder: <FileStat>{ uri: 'file:///home/oneFile', isDirectory: true, lastModification: 0 } });
    testContainer.bind(FolderPreferenceProviderFactory).toFactory(ctx =>
        (options: FolderPreferenceProviderOptions) => {
            const child = new Container({ defaultScope: 'Transient' });
            child.parent = ctx.container;
            child.bind(FolderPreferenceProviderOptions).toConstantValue(options);
            return child.get(FolderPreferenceProvider);
        }
    );

    testContainer.bind(PreferenceProviderProvider).toFactory(ctx => (scope: PreferenceScope) => {
        switch (scope) {
            case PreferenceScope.User:
                const userProvider = ctx.container.get(UserPreferenceProvider);
                sinon.stub(userProvider, 'onDidPreferencesChanged').get(() =>
                    mockUserPreferenceEmitter.event
                );
                return userProvider;
            case PreferenceScope.Workspace:
                const workspaceProvider = ctx.container.get(WorkspacePreferenceProvider);
                sinon.stub(workspaceProvider, 'onDidPreferencesChanged').get(() =>
                    mockWorkspacePreferenceEmitter.event
                );
                return workspaceProvider;
            case PreferenceScope.Folder:
                const folderProvider = ctx.container.get(FoldersPreferencesProvider);
                sinon.stub(folderProvider, 'onDidPreferencesChanged').get(() =>
                    mockFolderPreferenceEmitter.event
                );
                return folderProvider;
            default:
                return ctx.container.get(PreferenceSchemaProvider);
        }
    });
    testContainer.bind(PreferenceServiceImpl).toSelf().inSingletonScope();

    testContainer.bind(PreferenceService).toService(PreferenceServiceImpl);

    testContainer.bind(FileSystemPreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createFileSystemPreferences(preferences);
    }).inSingletonScope();

    /* Workspace mocks and bindings */
    testContainer.bind(WorkspaceServer).to(MockWorkspaceServer);
    testContainer.bind(WorkspaceService).toSelf();
    testContainer.bind(WorkspacePreferences).toDynamicValue(ctx => {
        const preferences = ctx.container.get<PreferenceService>(PreferenceService);
        return createWorkspacePreferences(preferences);
    }).inSingletonScope();

    /* Window mocks and bindings*/
    testContainer.bind(WindowService).to(MockWindowService);

    /* Resource mocks and bindings */
    testContainer.bind(MockResourceProvider).toDynamicValue(ctx => {
        const resourceProvider = new MockResourceProvider();
        sinon.stub(resourceProvider, 'get').callsFake(() => Promise.resolve({
            uri: new URI(''),
            dispose() { },
            readContents(): Promise<string> {
                return fs.readFile(tempPath, 'utf-8');
            },
            saveContents(content: string, options?: { encoding?: string }): Promise<void> {
                return fs.writeFile(tempPath, content);
            }
        }));
        return resourceProvider;
    });
    testContainer.bind(ResourceProvider).toProvider(context =>
        uri => context.container.get(MockResourceProvider).get(uri)
    );

    /* FS mocks and bindings */
    testContainer.bind(FileSystemWatcherServer).to(MockFilesystemWatcherServer);
    testContainer.bind(FileSystemWatcher).toSelf().onActivation((_, watcher) =>
        watcher
    );
    testContainer.bind(FileShouldOverwrite).toFunction(
        async (originalStat: FileStat, currentStat: FileStat): Promise<boolean> => true);

    testContainer.bind(FileSystem).to(MockFilesystem);

    /* Logger mock */
    testContainer.bind(ILogger).to(MockLogger);

    /* Message Service mocks */
    testContainer.bind(MessageService).toSelf().inSingletonScope();
    testContainer.bind(MessageClient).toSelf().inSingletonScope();
}

describe('Preference Service', () => {
    let prefService: PreferenceService;
    let prefSchema: PreferenceSchemaProvider;
    const stubs: sinon.SinonStub[] = [];

    before(() => {
        disableJSDOM = enableJSDOM();
        FrontendApplicationConfigProvider.set({
            'applicationName': 'test',
        });
        testContainerSetup();
    });

    after(() => {
        disableJSDOM();
    });

    beforeEach(() => {
        prefSchema = testContainer.get(PreferenceSchemaProvider);
        prefService = testContainer.get<PreferenceService>(PreferenceService);
        const impl = testContainer.get(PreferenceServiceImpl);
        impl.initialize();
    });

    afterEach(() => {
        prefService.dispose();
        stubs.forEach(s => s.restore());
        stubs.length = 0;
    });

    it('should get notified if a provider emits a change', done => {
        const userProvider = testContainer.get(UserPreferenceProvider);
        stubs.push(sinon.stub(userProvider, 'getPreferences').returns({
            testPref: 'oldVal'
        }));
        prefService.onPreferenceChanged(pref => {
            if (pref) {
                expect(pref.preferenceName).eq('testPref');
                expect(pref.newValue).eq('newVal');
                return done();
            }
            return done(new Error('onPreferenceChanged() fails to return any preference change infomation'));
        });
        stubs.push(sinon.stub(prefSchema, 'isValidInScope').returns(true));
        mockUserPreferenceEmitter.fire({
            testPref: {
                preferenceName: 'testPref',
                newValue: 'newVal',
                oldValue: 'oldVal',
                scope: PreferenceScope.User,
                domain: []
            }
        });
    }).timeout(2000);

    it('should return the preference from the more specific scope (user > workspace)', () => {
        const userProvider = testContainer.get(UserPreferenceProvider);
        const workspaceProvider = testContainer.get(WorkspacePreferenceProvider);
        stubs.push(sinon.stub(userProvider, 'getPreferences').returns({
            'test.boolean': true,
            'test.number': 1
        }));
        stubs.push(sinon.stub(workspaceProvider, 'getPreferences').returns({
            'test.boolean': false,
            'test.number': 0
        }));
        stubs.push(sinon.stub(prefSchema, 'isValidInScope').returns(true));
        expect(prefService.get('test.boolean')).to.be.false;
        expect(prefService.get('test.number')).equals(0);
    });

    it('should return the preference from the more specific scope (folders > workspace)', () => {
        const userProvider = testContainer.get(UserPreferenceProvider);
        const workspaceProvider = testContainer.get(WorkspacePreferenceProvider);
        const foldersProvider = testContainer.get(FoldersPreferencesProvider);
        const oneFolderProvider = testContainer.get(FolderPreferenceProvider);
        stubs.push(sinon.stub(userProvider, 'getPreferences').returns({
            'test.string': 'userValue',
            'test.number': 1
        }));
        stubs.push(sinon.stub(workspaceProvider, 'getPreferences').returns({
            'test.string': 'wsValue',
            'test.number': 0
        }));
        stubs.push(sinon.stub(foldersProvider, 'canProvide').returns({ priority: 10, provider: oneFolderProvider }));
        stubs.push(sinon.stub(foldersProvider, 'getPreferences').returns({
            'test.string': 'folderValue',
            'test.number': 20
        }));
        stubs.push(sinon.stub(prefSchema, 'isValidInScope').returns(true));
        expect(prefService.get('test.string')).equals('folderValue');
        expect(prefService.get('test.number')).equals(20);
    });

    it('should return the preference from the less specific scope if the value is removed from the more specific one', () => {
        const userProvider = testContainer.get(UserPreferenceProvider);
        const workspaceProvider = testContainer.get(WorkspacePreferenceProvider);
        stubs.push(sinon.stub(userProvider, 'getPreferences').returns({
            'test.boolean': true,
            'test.number': 1
        }));
        const stubWorkspace = sinon.stub(workspaceProvider, 'getPreferences').returns({
            'test.boolean': false,
            'test.number': 0
        });
        stubs.push(sinon.stub(prefSchema, 'isValidInScope').returns(true));
        expect(prefService.get('test.boolean')).to.be.false;

        stubWorkspace.restore();
        stubs.push(sinon.stub(workspaceProvider, 'getPreferences').returns({}));
        expect(prefService.get('test.boolean')).to.be.true;
    });

    it('should throw a TypeError if the preference (reference object) is modified', () => {
        const userProvider = testContainer.get(UserPreferenceProvider);
        stubs.push(sinon.stub(userProvider, 'getPreferences').returns({
            'test.immutable': [
                'test', 'test', 'test'
            ]
        }));
        stubs.push(sinon.stub(prefSchema, 'isValidInScope').returns(true));
        const immutablePref: string[] | undefined = prefService.get('test.immutable');
        expect(immutablePref).to.not.be.undefined;
        if (immutablePref !== undefined) {
            expect(() => immutablePref.push('fails')).to.throw(TypeError);
        }
    });

    it('should still report the more specific preference even though the less specific one changed', () => {
        const userProvider = testContainer.get(UserPreferenceProvider);
        const workspaceProvider = testContainer.get(WorkspacePreferenceProvider);
        const stubUser = sinon.stub(userProvider, 'getPreferences').returns({
            'test.boolean': true,
            'test.number': 1
        });
        stubs.push(sinon.stub(workspaceProvider, 'getPreferences').returns({
            'test.boolean': false,
            'test.number': 0
        }));
        mockUserPreferenceEmitter.fire({
            'test.number': {
                preferenceName: 'test.number',
                newValue: 2,
                scope: PreferenceScope.User,
                domain: []
            }
        });
        stubs.push(sinon.stub(prefSchema, 'isValidInScope').returns(true));
        expect(prefService.get('test.number')).equals(0);

        stubUser.restore();
        stubs.push(sinon.stub(userProvider, 'getPreferences').returns({
            'test.boolean': true,
            'test.number': 4
        }));
        mockUserPreferenceEmitter.fire({
            'test.number': {
                preferenceName: 'test.number',
                newValue: 4,
                scope: PreferenceScope.User,
                domain: []
            }
        });
        expect(prefService.get('test.number')).equals(0);
    });

    it('should store preference when settings file is empty', async () => {
        const settings = '{\n   "key": "value"\n}';
        await prefService.set('key', 'value', PreferenceScope.User);
        expect(fs.readFileSync(tempPath).toString()).equals(settings);
    });

    it('should store preference when settings file is not empty', async () => {
        const settings = '{\n   "key": "value",\n   "newKey": "newValue"\n}';
        fs.writeFileSync(tempPath, '{\n   "key": "value"\n}');
        await prefService.set('newKey', 'newValue', PreferenceScope.User);
        expect(fs.readFileSync(tempPath).toString()).equals(settings);
    });

    it('should override existing preference', async () => {
        const settings = '{\n   "key": "newValue"\n}';
        fs.writeFileSync(tempPath, '{\n   "key": "oldValue"\n}');
        await prefService.set('key', 'newValue', PreferenceScope.User);
        expect(fs.readFileSync(tempPath).toString()).equals(settings);
    });

    /**
     * A slow provider that becomes ready after 1 second.
     */
    class SlowProvider extends MockPreferenceProvider {
        constructor() {
            super();
            setTimeout(() => {
                this.prefs['mypref'] = 2;
                this._ready.resolve();
            }, 1000);
        }
    }
    /**
     * Default provider that becomes ready after constructor gets called
     */
    class MockDefaultProvider extends MockPreferenceProvider {
        constructor() {
            super();
            this.prefs['mypref'] = 5;
            this._ready.resolve();
        }
    }

    /**
     * Make sure that the preference service is ready only once the providers
     * are ready to provide preferences.
     */
    it('should be ready only when all providers are ready', async () => {
        const container = new Container();
        bindPreferenceSchemaProvider(container.bind.bind(container));
        container.bind(ILogger).to(MockLogger);
        container.bind(PreferenceProviderProvider).toFactory(ctx => (scope: PreferenceScope) => {
            if (scope === PreferenceScope.User) {
                return new MockDefaultProvider();
            }
            return new SlowProvider();
        });
        container.bind(PreferenceServiceImpl).toSelf().inSingletonScope();

        const service = container.get<PreferenceServiceImpl>(PreferenceServiceImpl);
        service.initialize();
        prefSchema = container.get(PreferenceSchemaProvider);
        await service.ready;
        stubs.push(sinon.stub(PreferenceServiceImpl, <any>'doSetProvider').callsFake(() => { }));
        stubs.push(sinon.stub(prefSchema, 'isValidInScope').returns(true));
        expect(service.get('mypref')).to.equal(2);
    });

    it('should answer queries before all providers are ready', async () => {
        const container = new Container();
        bindPreferenceSchemaProvider(container.bind.bind(container));
        container.bind(ILogger).to(MockLogger);
        container.bind(PreferenceProviderProvider).toFactory(ctx => (scope: PreferenceScope) => {
            if (scope === PreferenceScope.User) {
                return new MockDefaultProvider();
            }
            return new SlowProvider();
        });
        container.bind(PreferenceServiceImpl).toSelf().inSingletonScope();

        const service = container.get<PreferenceServiceImpl>(PreferenceServiceImpl);
        service.initialize();
        prefSchema = container.get(PreferenceSchemaProvider);
        stubs.push(sinon.stub(PreferenceServiceImpl, <any>'doSetProvider').callsFake(() => { }));
        stubs.push(sinon.stub(prefSchema, 'isValidInScope').returns(true));
        expect(service.get('mypref')).to.equal(5);
    });
});

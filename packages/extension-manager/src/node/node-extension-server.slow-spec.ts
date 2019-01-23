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

import * as temp from 'temp';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as assert from 'assert';
import { ExtensionClient, ExtensionServer, Extension } from '../common/extension-protocol';
import extensionNodeTestContainer from './test/extension-node-test-container';
import { ApplicationProject } from './application-project';

process.on('unhandledRejection', (reason, promise) => {
    console.error(reason);
    throw reason;
});

let appProjectPath: string;
let appProject: ApplicationProject;
let server: ExtensionServer;

export function waitForDidChange(): Promise<void> {
    return new Promise(resolve => {
        server.setClient(<ExtensionClient>{
            onDidChange: change => resolve()
        });
    });
}

const dir = path.resolve(__dirname, '..', '..', 'node-extension-server-test-temp');
fs.ensureDirSync(dir);

describe('node-extension-server', function () {

    beforeEach(function () {
        this.timeout(50000);
        appProjectPath = temp.mkdirSync({ dir });
        fs.writeJsonSync(path.resolve(appProjectPath, 'package.json'), {
            'dependencies': {
                '@devpodio/core': '0.1.0',
                '@devpodio/extension-manager': '0.1.0'
            }
        });

        const container = extensionNodeTestContainer({
            projectPath: appProjectPath,
            npmClient: 'yarn',
            autoInstall: false,
            watchRegistry: false
        });
        server = container.get(ExtensionServer);
        appProject = container.get(ApplicationProject);
    });

    afterEach(function () {
        this.timeout(50000);
        server.dispose();
        appProject.dispose();
        fs.removeSync(appProjectPath);
    });

    it.skip('search', function () {
        this.timeout(30000);

        return server.search({
            query: 'filesystem scope:theia'
        }).then(extensions => {
            assert.equal(extensions.length, 1, JSON.stringify(extensions, undefined, 2));
            assert.equal(extensions[0].name, '@devpodio/filesystem');
        });
    });

    it.skip('installed', function () {
        this.timeout(10000);

        return server.installed().then(extensions => {
            assert.equal(true, extensions.length >= 3, JSON.stringify(extensions, undefined, 2));
            assert.equal(true, extensions.some(e => e.name === '@devpodio/core'), JSON.stringify(before, undefined, 2));
            assert.equal(true, extensions.some(e => e.name === '@devpodio/filesystem'), JSON.stringify(before, undefined, 2));
            assert.equal(true, extensions.some(e => e.name === '@devpodio/extension-manager'), JSON.stringify(before, undefined, 2));
        });
    });

    it.skip('install', async function () {
        this.timeout(10000);

        const before = await server.installed();
        assert.equal(false, before.some(e => e.name === '@devpodio/editor'), JSON.stringify(before, undefined, 2));

        const onDidChangePackage = waitForDidChange();

        await server.install('@devpodio/editor');

        await onDidChangePackage;
        return server.installed().then(after => {
            assert.equal(true, after.some(e => e.name === '@devpodio/editor'), JSON.stringify(after, undefined, 2));
        });
    });

    it.skip('uninstall', async function () {
        this.timeout(10000);

        const before = await server.installed();
        assert.equal(true, before.some(e => e.name === '@devpodio/extension-manager'), JSON.stringify(before, undefined, 2));

        const onDidChangePackage = waitForDidChange();

        await server.uninstall('@devpodio/extension-manager');

        await onDidChangePackage;
        return server.installed().then(after => {
            assert.equal(false, after.some(e => e.name === '@devpodio/extension-manager'), JSON.stringify(after, undefined, 2));
        });
    });

    it.skip('outdated', function () {
        this.timeout(10000);

        return server.outdated().then(extensions => {
            assert.equal(extensions.length, 2, JSON.stringify(extensions, undefined, 2));
            assert.deepEqual(extensions.map(e => e.name).sort(), ['@devpodio/core', '@devpodio/extension-manager']);
        });
    });

    it.skip('update', async function () {
        this.timeout(10000);

        const before = await server.outdated();
        assert.equal(true, before.some(e => e.name === '@devpodio/core'), JSON.stringify(before, undefined, 2));

        const onDidChangePackage = waitForDidChange();

        await server.update('@devpodio/core');

        await onDidChangePackage;
        return server.outdated().then(after => {
            assert.equal(false, after.some(e => e.name === '@devpodio/core'), JSON.stringify(after, undefined, 2));
        });
    });

    it.skip('list', function () {
        this.timeout(10000);

        return server.list().then(extensions => {
            assertExtension({
                name: '@devpodio/core',
                installed: true,
                outdated: true,
                dependent: undefined
            }, extensions);

            assertExtension({
                name: '@devpodio/filesystem',
                installed: true,
                outdated: false,
                dependent: '@devpodio/extension-manager'
            }, extensions);

            assertExtension({
                name: '@devpodio/extension-manager',
                installed: true,
                outdated: true,
                dependent: undefined
            }, extensions);
        });
    });

    it.skip('list with search', function () {
        this.timeout(50000);

        return server.list({
            query: 'scope:theia file'
        }).then(extensions => {
            const filtered = extensions.filter(e => ['@devpodio/filesystem', '@devpodio/file-search'].indexOf(e.name) !== -1);

            assertExtension({
                name: '@devpodio/filesystem',
                installed: true,
                outdated: false,
                dependent: '@devpodio/extension-manager'
            }, filtered);

            assertExtension({
                name: '@devpodio/file-search',
                installed: false,
                outdated: false,
                dependent: undefined
            }, filtered);
        });
    });

});

function assertExtension(expectation: {
    name: string
    installed: boolean
    outdated: boolean
    dependent?: string
}, extensions: Extension[]): void {
    const extension = extensions.find(e => e.name === expectation.name)!;
    assert.ok(extension, JSON.stringify(extensions, undefined, 2));
    assert.deepEqual(expectation, Object.assign({}, {
        name: extension!.name,
        installed: extension.installed,
        outdated: extension.outdated,
        dependent: extension.dependent
    }), JSON.stringify(extensions, undefined, 2));
}

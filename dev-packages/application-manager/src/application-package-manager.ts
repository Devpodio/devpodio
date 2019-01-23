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

import * as path from 'path';
import * as fs from 'fs-extra';
import * as cp from 'child_process';
import { ApplicationPackage, ApplicationPackageOptions } from '@devpodio/application-package';
import { WebpackGenerator, FrontendGenerator, BackendGenerator } from './generator';
import { ApplicationProcess } from './application-process';

export class ApplicationPackageManager {

    readonly pck: ApplicationPackage;
    /** application process */
    readonly process: ApplicationProcess;
    /** manager process */
    protected readonly __process: ApplicationProcess;
    protected readonly webpack: WebpackGenerator;
    protected readonly backend: BackendGenerator;
    protected readonly frontend: FrontendGenerator;

    constructor(options: ApplicationPackageOptions) {
        this.pck = new ApplicationPackage(options);
        this.process = new ApplicationProcess(this.pck, options.projectPath);
        this.__process = new ApplicationProcess(this.pck, path.join(__dirname, '..'));
        this.webpack = new WebpackGenerator(this.pck);
        this.backend = new BackendGenerator(this.pck);
        this.frontend = new FrontendGenerator(this.pck);
    }

    protected async remove(fsPath: string): Promise<void> {
        if (await fs.pathExists(fsPath)) {
            await fs.remove(fsPath);
        }
    }

    async clean(): Promise<void> {
        await this.remove(this.pck.lib());
        await this.remove(this.pck.srcGen());
        await this.remove(this.webpack.configPath);
    }

    async generate(): Promise<void> {
        await this.webpack.generate();
        await this.backend.generate();
        await this.frontend.generate();
    }

    async build(args: string[] = []): Promise<void> {
        await this.generate();
        await fs.ensureDir(this.pck.lib());
        return this.__process.run('webpack', args);
    }

    async start(args: string[] = []): Promise<void> {
        if (this.pck.isElectron()) {
            return this.startElectron(args);
        }
        return this.startBrowser(args);
    }

    async startElectron(args: string[]): Promise<void> {
        this.__process.spawnBin('electron', [this.pck.frontend('electron-main.js'), ...args],
            { stdio: [0, 1, 2] });
    }

    async startBrowser(args: string[]): Promise<void> {
        const options: cp.ForkOptions = {
            stdio: [0, 1, 2, 'ipc'],
            env: {
                ...process.env,
                THEIA_PARENT_PID: String(process.pid)
            }
        };
        const mainArgs = [...args];
        const inspectIndex = mainArgs.findIndex(v => v.startsWith('--inspect'));
        if (inspectIndex !== -1) {
            const inspectArg = mainArgs.splice(inspectIndex, 1)[0];
            options.execArgv = ['--nolazy', inspectArg];
        }
        this.__process.fork(this.pck.backend('main.js'), mainArgs, options);
    }

}

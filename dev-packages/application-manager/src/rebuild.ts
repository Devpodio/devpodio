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

import { existsSync, readJsonSync, copySync, readFileSync, writeFile, writeFileSync, removeSync, readdirSync, lstatSync } from 'fs-extra';
import { join } from 'path';
import { spawnSync } from 'child_process';

export function rebuild(target: 'electron' | 'browser', modules: string[]) {
    const nodeModulesPath = join(process.cwd(), 'node_modules');
    const browserModulesPath = join(process.cwd(), '.browser_modules');
    const modulesToProcess = modules || ['@theia/node-pty', 'nsfw', 'find-git-repositories'];

    if (target === 'electron' && !existsSync(browserModulesPath)) {
        const dependencies: {
            [dependency: string]: string
        } = {};
        for (const module of modulesToProcess) {
            console.log('Processing ' + module);
            const src = join(nodeModulesPath, module);
            if (existsSync(src)) {
                const dest = join(browserModulesPath, module);
                const packJson = readJsonSync(join(src, 'package.json'));
                dependencies[module] = packJson.version;
                copySync(src, dest);
            }
        }
        const packFile = join(process.cwd(), 'package.json');
        const packageText = readFileSync(packFile);
        const pack = readJsonSync(packFile);
        try {
            pack.dependencies = Object.assign({}, pack.dependencies, dependencies);
            writeFileSync(packFile, JSON.stringify(pack, undefined, '  '));
            const electronRebuildPath = join(process.cwd(), 'node_modules', '.bin', 'electron-rebuild');
            if (process.platform === 'win32') {
                spawnSync('cmd', ['/c', electronRebuildPath]);
            } else {
                require(electronRebuildPath);
            }
        } finally {
            setTimeout(() => {
                writeFile(packFile, packageText);
            }, 100);
        }
    } else if (target === 'browser' && existsSync(browserModulesPath)) {
        for (const moduleName of collectModulePaths(browserModulesPath)) {
            console.log('Reverting ' + moduleName);
            const src = join(browserModulesPath, moduleName);
            const dest = join(nodeModulesPath, moduleName);
            removeSync(dest);
            copySync(src, dest);
        }
        removeSync(browserModulesPath);
    } else {
        console.log('native node modules are already rebuilt for ' + target);
    }
}

function collectModulePaths(root: string): string[] {
    const moduleRelativePaths: string[] = [];
    for (const dirName of readdirSync(root)) {
        if (existsSync(join(root, dirName, 'package.json'))) {
            moduleRelativePaths.push(dirName);
        } else if (lstatSync(join(root, dirName)).isDirectory()) {
            moduleRelativePaths.push(...collectModulePaths(join(root, dirName)).map(p => join(dirName, p)));
        }
    }
    return moduleRelativePaths;
}

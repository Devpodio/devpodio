/********************************************************************************
 * Copyright (c) 2019 TypeFox and others
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
// @ts-check

const path = require('path');
const chalk = require('chalk').default;
const cp = require('child_process');
const request = require('request');

let code = 0;
let done = false;
let counter = 0;
let timerCount;
const getPackageLink = (package) => {
    const pck = `${package.name}/-/${package.name.split('/')[1]}-${package.version}.tgz`
    return `https://registry.npmjs.org/${pck}`
}

const headRequest = async function (uri, pck) {
    return new Promise((resolve, reject) => {
        counter--;
        code = 0;
        request({ method: 'HEAD', uri })
            .on('error', function (error) {
                console.error(`(${chalk.red('ERR')}) ${pck.name}: ${chalk.red('NOT')} published`);
                code = 1;
            })
            .on('response', function (response) {
                if (response.statusCode !== 200) {
                    console.error(`${chalk.red('ERR')}) ${pck.name}: ${chalk.red('NOT')} published`);
                    code = 1;
                }else {
                    console.info(`${chalk.green('✔')} ${pck.name}: ${chalk.green('published')} statusCode: ${response.statusCode}`);
                }

            }).on('complete', () => {
                if (code == 1) {
                    return reject()
                }
                return resolve();
            })
    })
}
const checkPublish = async function () {
    const workspaces = JSON.parse(JSON.parse(cp.execSync('yarn workspaces info --json').toString()).data);
    for (const name in workspaces) {
        const workspace = workspaces[name];
        const location = path.resolve(process.cwd(), workspace.location);
        const packagePath = path.resolve(location, 'package.json');
        const pck = require(packagePath);
        if (!pck.private) {
            counter++;
            const pckUrl = getPackageLink(pck);
            headRequest(pckUrl, pck);
        }
    }
    return code;
}
checkPublish();
const checker = () => {
    timerCount = setTimeout(() => {
        if(done) {
            process.nextTick(process.exit);
        }else {
            clearTimeout(timerCount);
            checker();
        }
    })
}

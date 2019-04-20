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

import { AbstractGenerator } from './abstract-generator';

export class BackendGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        const backendModules = this.pck.targetBackendModules;
        await this.write(this.pck.backend('server.js'), this.compileServer(backendModules));
        await this.write(this.pck.backend('main.js'), this.compileMain(backendModules));
    }

    protected compileServer(backendModules: Map<string, string>): string {
        return `// @ts-check
require('reflect-metadata');
const path = require('path');
const yargs = require('yargs');
const express = require('express');
const corsHandler = require('cors');
const escapeStringRegexp = require("escape-string-regexp")
const tldjs = require('tldjs');
const { Container } = require('inversify');
const { BackendApplication, CliManager } = require('@devpodio/core/lib/node');
const { backendApplicationModule } = require('@devpodio/core/lib/node/backend-application-module');
const { messagingBackendModule } = require('@devpodio/core/lib/node/messaging/messaging-backend-module');
const { loggerBackendModule } = require('@devpodio/core/lib/node/logger-backend-module');

let { env: { cors, origin } } = yargs.option('env.cors', {
    description: "Enabe cors headers, set true to enable, false to disable.",
    type: "boolean"
}).option('env.origin', {
    description: "The domain or list(comma separated) of domain to to allow cors requests. Regex expressions are allowed",
    type: "string"
}).argv;

const container = new Container();
container.load(backendApplicationModule);
container.load(messagingBackendModule);
container.load(loggerBackendModule);

function load(raw) {
    return Promise.resolve(raw.default).then(module =>
        container.load(module)
    )
}

function start(port, host, argv) {
    if (argv === undefined) {
        argv = process.argv;
    }

    const cliManager = container.get(CliManager);
    return cliManager.initializeCli(argv).then(function () {
        const application = container.get(BackendApplication);
        if(cors || origin) {
            if(origin) {
                origin = origin.split(',').map(list => new RegExp(escapeStringRegexp(list)));
            }
            if(cors && !origin) {
                origin = true;
            }
        } else if (!cors && !origin) {
            origin = false;
        }
        application.use(corsHandler((ctx, callback)=> {
            console.info(ctx.request,callback);
            callback(null, true);
        }));
        console.info('Cors', (cors || origin) ? 'enabled for'+ origin: 'disabled');
        application.use(express.static(path.join(__dirname, '../../lib')));
        application.use(express.static(path.join(__dirname, '../../lib/index.html')));
        return application.start(port, host);
    });
}

module.exports = (port, host, argv) => Promise.resolve()${this.compileBackendModuleImports(backendModules)}
    .then(() => start(port, host, argv)).catch(reason => {
        console.error('Failed to start the backend application.');
        if (reason) {
            console.error(reason);
        }
        throw reason;
    });`;
    }

    protected compileMain(backendModules: Map<string, string>): string {
        return `// @ts-check
const { BackendApplicationConfigProvider } = require('@devpodio/core/lib/node/backend-application-config-provider');
const main = require('@devpodio/core/lib/node/main');
BackendApplicationConfigProvider.set(${this.prettyStringify(this.pck.props.backend.config)});

const serverModule = require('./server');
const address = main.start(serverModule());
address.then(function (address) {
    if (process && process.send) {
        process.send(address.port.toString());
    }
});
module.exports = address;
`;
    }

}

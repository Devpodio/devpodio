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

export class FrontendGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        const frontendModules = this.pck.targetFrontendModules;
        await this.write(this.pck.frontend('index.html'), this.compileIndexHtml(frontendModules));
        await this.write(this.pck.frontend('index.js'), this.compileIndexJs(frontendModules));
        if (this.pck.isElectron()) {
            await this.write(this.pck.frontend('electron-main.js'), this.compileElectronMain());
        }
    }

    protected compileIndexHtml(frontendModules: Map<string, string>): string {
        return `<!DOCTYPE html>
<html>

<head>${this.compileIndexHead(frontendModules)}
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
<link rel="icon" type="image/png" sizes="32x32" href="img/devpod-32x32.png">
<link rel="apple-touch-icon" type="image/png" sizes="144x144" href="img/devpod-144x144.png">
<link rel="icon" type="image/png" sizes="192x192" href="img/devpod-192x192.png">
<link rel="apple-touch-icon" type="image/png" sizes="512x512" href="img/devpod-512x512.png">
<link rel="manifest"  href="/json/manifest.json">
</head>

<body>
    <div class="theia-preload"></div>
    <script type="application/javascript">
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('sw.js').then(registration => {
                console.log('SW registered: ', registration);
            }).catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
        });
    }
    </script>
</body>

</html>`;
    }

    protected compileIndexHead(frontendModules: Map<string, string>): string {
        return `
  <meta charset="UTF-8">`;
    }

    protected compileIndexJs(frontendModules: Map<string, string>): string {
        return `// @ts-check
${this.ifBrowser("require('es6-promise/auto');")}
require('reflect-metadata');
const { Container } = require('inversify');
const { FrontendApplication } = require('@devpodio/core/lib/browser');
const { frontendApplicationModule } = require('@devpodio/core/lib/browser/frontend-application-module');
const { messagingFrontendModule } = require('@devpodio/core/lib/browser/messaging/messaging-frontend-module');
const { loggerFrontendModule } = require('@devpodio/core/lib/browser/logger-frontend-module');
const { ThemeService } = require('@devpodio/core/lib/browser/theming');
const { FrontendApplicationConfigProvider } = require('@devpodio/core/lib/browser/frontend-application-config-provider');

FrontendApplicationConfigProvider.set(${this.prettyStringify(this.pck.props.frontend.config)});

const container = new Container();
container.load(frontendApplicationModule);
container.load(messagingFrontendModule);
container.load(loggerFrontendModule);

function load(raw) {
    return Promise.resolve(raw.default).then(module =>
        container.load(module)
    )
}

function start() {
    const themeService = ThemeService.get();
    themeService.loadUserTheme();

    const application = container.get(FrontendApplication);
    application.start();
}

module.exports = Promise.resolve()${this.compileFrontendModuleImports(frontendModules)}
    .then(start).catch(reason => {
        console.error('Failed to start the frontend application.');
        if (reason) {
            console.error(reason);
        }
    });`;
    }

    protected compileElectronMain(): string {
        return `// @ts-check

// Useful for Electron/NW.js apps as GUI apps on macOS doesn't inherit the \`$PATH\` define
// in your dotfiles (.bashrc/.bash_profile/.zshrc/etc).
// https://github.com/electron/electron/issues/550#issuecomment-162037357
// https://github.com/theia-ide/theia/pull/3534#issuecomment-439689082
require('fix-path')();

// Workaround for https://github.com/electron/electron/issues/9225. Chrome has an issue where
// in certain locales (e.g. PL), image metrics are wrongly computed. We explicitly set the
// LC_NUMERIC to prevent this from happening (selects the numeric formatting category of the
// C locale, http://en.cppreference.com/w/cpp/locale/LC_categories).
if (process.env.LC_ALL) {
    process.env.LC_ALL = 'C';
}
process.env.LC_NUMERIC = 'C';

const electron = require('electron');
const { join, resolve } = require('path');
const { isMaster } = require('cluster');
const { fork } = require('child_process');
const { app, BrowserWindow, ipcMain, Menu } = electron;

const applicationName = \`${this.pck.props.frontend.config.applicationName}\`;

if (isMaster) {
    app.on('ready', () => {
        const { screen } = electron;

        // Remove the default electron menus, waiting for the application to set its own.
        Menu.setApplicationMenu(Menu.buildFromTemplate([{
            role: 'help', submenu: [{ role: 'toggledevtools'}]
        }]));

        // Window list tracker.
        const windows = [];

        function createNewWindow(theUrl) {

            // We must center by hand because \`browserWindow.center()\` fails on multi-screen setups
            // See: https://github.com/electron/electron/issues/3490
            const { bounds } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
            const height = Math.floor(bounds.height * (2/3));
            const width = Math.floor(bounds.width * (2/3));

            const y = Math.floor(bounds.y + (bounds.height - height) / 2);
            const x = Math.floor(bounds.x + (bounds.width - width) / 2);

            const newWindow = new BrowserWindow({ width, height, x, y, show: !!theUrl, title: applicationName });

            if (windows.length === 0) {
                newWindow.webContents.on('new-window', (event, url, frameName, disposition, options) => {
                    // If the first electron window isn't visible, then all other new windows will remain invisible.
                    // https://github.com/electron/electron/issues/3751
                    options.show = true;
                    options.width = width;
                    options.height = height;
                    options.title = applicationName;
                });
            }
            windows.push(newWindow);
            if (!!theUrl) {
                newWindow.loadURL(theUrl);
            } else {
                newWindow.on('ready-to-show', () => newWindow.show());
            }
            newWindow.on('closed', () => {
                const index = windows.indexOf(newWindow);
                if (index !== -1) {
                    windows.splice(index, 1);
                }
                if (windows.length === 0) {
                    app.exit(0);
                }
            });
            return newWindow;
        }

        app.on('window-all-closed', () => {
            if (process.platform !== 'darwin') {
                app.quit();
            }
        });
        ipcMain.on('create-new-window', (event, url) => {
            createNewWindow(url);
        });

        // Check whether we are in bundled application or development mode.
        // @ts-ignore
        const devMode = process.defaultApp || /node_modules[\/]electron[\/]/.test(process.execPath);
        const mainWindow = createNewWindow();
        const loadMainWindow = (port) => {
            mainWindow.loadURL('file://' + join(__dirname, '../../lib/index.html') + '?port=' + port);
        };

        // We cannot use the \`process.cwd()\` as the application project path (the location of the \`package.json\` in other words)
        // in a bundled electron application because it depends on the way we start it. For instance, on OS X, these are a differences:
        // https://github.com/theia-ide/theia/issues/3297#issuecomment-439172274
        process.env.THEIA_APP_PROJECT_PATH = resolve(__dirname, '..', '..');

        // Set the electron version for both the dev and the production mode. (https://github.com/theia-ide/theia/issues/3254)
        // Otherwise, the forked backend processes will not know that they're serving the electron frontend.
        const { versions } = process;
        // @ts-ignore
        if (versions && typeof versions.electron !== 'undefined') {
            // @ts-ignore
            process.env.THEIA_ELECTRON_VERSION = versions.electron;
        }

        const mainPath = join(__dirname, '..', 'backend', 'main');
        // We need to distinguish between bundled application and development mode when starting the clusters.
        // See: https://github.com/electron/electron/issues/6337#issuecomment-230183287
        if (devMode) {
            require(mainPath).then(address => {
                loadMainWindow(address.port);
            }).catch((error) => {
                console.error(error);
                app.exit(1);
            });
        } else {
            const cp = fork(mainPath, [], { env: Object.assign({}, process.env) });
            cp.on('message', (message) => {
                loadMainWindow(message);
            });
            cp.on('error', (error) => {
                console.error(error);
                app.exit(1);
            });
            app.on('quit', () => {
                // If we forked the process for the clusters, we need to manually terminate it.
                // See: https://github.com/theia-ide/theia/issues/835
                process.kill(cp.pid);
            });
        }
    });
} else {
    require('../backend/main');
}
`;
    }

}

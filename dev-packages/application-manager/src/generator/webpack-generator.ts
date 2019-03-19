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

import * as paths from 'path';
import * as fs from 'fs-extra';
import { AbstractGenerator } from './abstract-generator';

export class WebpackGenerator extends AbstractGenerator {

    async generate(): Promise<void> {
        await this.write(this.configPath, this.compileWebpackConfig());
        await this.write(this.manifestPath, this.compileManifest());
    }

    get configPath(): string {
        return this.pck.path('webpack.config.js');
    }

    get manifestPath(): string {
        return this.pck.path('lib/json/manifest.json');
    }

    protected getTemplate(templateName: string): string {
        return paths.resolve(__dirname, '../../src/generator/templates', templateName + '.template');
    }

    protected resolve(moduleName: string, path: string): string {
        return this.pck.resolveModulePath(moduleName, path).split(paths.sep).join('/');
    }
    protected resolveLogo(): string {
        return paths.resolve(__dirname, '../../src/generator/templates', 'pwa-logo');
    }

    protected compileManifest(): string {
        return fs.readFileSync(this.getTemplate('manifest')).toString();
    }

    protected compileWebpackConfig(): string {
        return `// @ts-check
const path = require('path');
const webpack = require('webpack');
const yargs = require('yargs');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const CircularDependencyPlugin = require('circular-dependency-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const TerserWebpackPlugin = require('terser-webpack-plugin');
const OptimizeCSSAssetsPlugin = require("optimize-css-assets-webpack-plugin");
const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const PreloadWebpackPlugin = require('preload-webpack-plugin');
const {GenerateSW} = require('workbox-webpack-plugin');

const outputPath = path.resolve(__dirname, 'lib');
const { mode, env: { hashed } } = yargs.option('mode', {
    description: "Mode to use",
    choices: ["development", "production"],
    default: "production"
}).option('env.hashed', {
    description: "Append the content hash to the bundle's filename",
    type: "boolean",
    default: false
}).argv;
const development = mode === 'development';${this.ifMonaco(() => `

const monacoEditorCorePath = development ? '${this.resolve('@typefox/monaco-editor-core', 'dev/vs')}' : '${this.resolve('@typefox/monaco-editor-core', 'min/vs')}';
const monacoCssLanguagePath = '${this.resolve('monaco-css', 'release/min')}';
const monacoHtmlLanguagePath = '${this.resolve('monaco-html', 'release/min')}';
const iconPath = '${this.resolveLogo()}'
`)}

module.exports = {
    entry: path.resolve(__dirname, 'src-gen/frontend/index.js'),
    output: {
        filename: hashed ? 'js/[contenthash:8].js' : 'js/bundle.js',
        path: outputPath
    },
    target: '${this.ifBrowser('web', 'electron-renderer')}',
    mode,
    node: {${this.ifElectron(`
        __dirname: false,
        __filename: false`, `
        fs: 'empty',
        child_process: 'empty',
        net: 'empty',
        crypto: 'empty'`)}
    },
    optimization: {
        runtimeChunk: 'single',
        splitChunks: {
            cacheGroups: {
                commons: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    chunks: 'all',
                    reuseExistingChunk: true
                },
                styles: {
                    name: 'styles',
                    test: /\\.css$/,
                    chunks: 'all',
                    enforce: true
                }
            }
        },
        minimize: true,
        minimizer: [
            new TerserWebpackPlugin({
                parallel: true,
                cache: true,
                sourceMap: false,
                extractComments: true,
                terserOptions: {
                    output: { comments: false }
                }
            }),
            new OptimizeCSSAssetsPlugin({})
        ]
    },
    module: {
        rules: [
            {
                test: /worker-main\\.js$/,
                loader: 'worker-loader',
                options: {
                    name: 'worker-ext.[hash].js'
                }
            },
            {
                test: /\\.css$/,
                exclude: /\\.useable\\.css$/,
                loader: [
                    MiniCssExtractPlugin.loader,
                    "css-loader"
                ]
            },
            {
                test: /\\.useable\\.css$/,
                use: [
                    {
                        loader: 'style-loader/useable',
                        options: { singleton: true,  attrs: { id: 'theia-theme' } }
                    },
                    { loader: 'css-loader' },
                ]
            },
            {
                test: /\\.(jpg|png|gif)$/,
                loader: 'file-loader',
                options: {
                    name: '[hash].[ext]'
                }
            },
            {
                test: /\\.(ttf|eot|svg)(\\?v=\\d+\\.\\d+\\.\\d+)?$/,
                 use: [{
                    loader: 'url-loader',
                    options: {
                        name: '[hash].[ext]',
                        limit: 10000,
                        mimetype: 'image/svg+xml',
                        outputPath: 'fonts/'
                    }
                }]
            },
            {
                test: /\\.woff(2)?(\\?v=[0-9]\\.[0-9]\\.[0-9])?$/,
                use: [{
                    loader: 'url-loader',
                    options: {
                        name: '[hash].[ext]',
                        limit: 10000,
                        mimetype: 'application/font-woff',
                        outputPath: 'fonts/'
                    }
                }]
            },
            {
                test: /node_modules[\\\\/](vscode-languageserver-types|vscode-uri|jsonc-parser)/,
                use: { loader: 'umd-compat-loader' }
            },
            {
                test: /\\.wasm$/,
                loader: "file-loader",
                type: "javascript/auto",
            },
            {
                test: /\\.plist$/,
                loader: "file-loader",
            },
        ]
    },
    resolve: {
        extensions: ['.js']${this.ifMonaco(() => `,
        alias: {
            'vs': path.resolve(outputPath, monacoEditorCorePath),
            'vscode': require.resolve('monaco-languageclient/lib/vscode-compatibility')
        }`)}
    },
    devtool:  false,
    plugins: [
        new MiniCssExtractPlugin({
            filename: "[contenthash].css",
        }),
        new webpack.optimize.ModuleConcatenationPlugin(),
        new HtmlWebpackPlugin({
            filename: 'index.html',
            template: 'src-gen/frontend/index.html'
        }),
        new PreloadWebpackPlugin({
            rel: 'preload',
            as(entry) {
                   if (/\\.css$/.test(entry)) return 'style';
                if (/\\.woff$/.test(entry)) return 'font';
                if (/\\.png$/.test(entry)) return 'image';
                return 'script';
            },
            include: 'allChunks'
        }),
        new GenerateSW({
            swDest: 'sw.js',
            clientsClaim: true,
            skipWaiting: true
        }),
        new webpack.HashedModuleIdsPlugin(),
        new CopyWebpackPlugin([${this.ifMonaco(() => `
            {
                from: monacoEditorCorePath,
                to: 'vs'
            },
            {
                from: monacoCssLanguagePath,
                to: 'vs/language/css'
            },
            {
                from: monacoHtmlLanguagePath,
                to: 'vs/language/html'
            },
            {
                from: iconPath,
                to: 'img'
            }`)}
        ]),
        new CircularDependencyPlugin({
            exclude: /(node_modules|examples)\\/./,
            failOnError: false // https://github.com/nodejs/readable-stream/issues/280#issuecomment-297076462
        }),
    ],
    stats: {
        warnings: true
    }
};`;
    }

}

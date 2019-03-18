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

import { injectable, inject, postConstruct } from 'inversify';
import { Emitter, Event } from '@devpodio/core';
import { CppPreferences } from './cpp-preferences';
import { StorageService } from '@devpodio/core/lib/browser/storage-service';

export interface CppBuildConfiguration {
    /** Human-readable configuration name.  */
    name: string;

    /** Base directory of this build.  */
    directory: string;

    /** List of commands for this build configuration.  */
    commands?: {
        'build'?: string
    };
}

/** What we save in the local storage.  */
class SavedActiveBuildConfiguration {
    configName?: string;
}

export const CppBuildConfigurationManager = Symbol('CppBuildConfigurationManager');
export interface CppBuildConfigurationManager {
    /** Get the list of defined build configurations.  */
    getConfigs(): CppBuildConfiguration[];

    /** Get the list of valid defined build configurations.  */
    getValidConfigs(): CppBuildConfiguration[];

    /** Get the active build configuration.  */
    getActiveConfig(): CppBuildConfiguration | undefined;

    /** Change the active build configuration.  */
    setActiveConfig(config: CppBuildConfiguration | undefined): void;

    /** Event emitted when the active build configuration changes.  */
    onActiveConfigChange: Event<CppBuildConfiguration | undefined>;

    /**
     * Promise resolved when the list of build configurations has been read
     * once, and the active configuration has been set, if relevant.
     */
    ready: Promise<void>;
}

export const CPP_BUILD_CONFIGURATIONS_PREFERENCE_KEY = 'cpp.buildConfigurations';

/**
 * Entry point to get the list of build configurations and get/set the active
 * build configuration.
 */
@injectable()
export class CppBuildConfigurationManagerImpl implements CppBuildConfigurationManager {

    @inject(CppPreferences)
    protected readonly cppPreferences: CppPreferences;

    @inject(StorageService)
    protected readonly storageService: StorageService;

    /**
     * The current active build configuration.  undefined means there's not
     * current active configuration.
     */
    protected activeConfig: CppBuildConfiguration | undefined;

    /** Emitter for when the active build configuration changes.  */
    protected readonly activeConfigChangeEmitter = new Emitter<CppBuildConfiguration | undefined>();

    readonly ACTIVE_BUILD_CONFIGURATION_STORAGE_KEY = 'cpp.active-build-configuration';

    public ready: Promise<void>;

    @postConstruct()
    async init() {
        // Try to read the active build config from local storage.
        this.ready = new Promise(async resolve => {
            await this.cppPreferences.ready;
            this.loadActiveConfiguration().then(resolve);
            this.cppPreferences.onPreferenceChanged(() => this.handlePreferencesUpdate());
        });
    }

    /** Load the active build config from the persistent storage.  */
    protected async loadActiveConfiguration() {
        const savedConfig =
            await this.storageService.getData<SavedActiveBuildConfiguration>(
                this.ACTIVE_BUILD_CONFIGURATION_STORAGE_KEY);

        if (savedConfig !== undefined && savedConfig.configName !== undefined) {
            // Try to find an existing config with that name.
            const configs = this.getConfigs();
            const config = configs.find(cfg => savedConfig.configName === cfg.name);
            if (config) {
                this.setActiveConfig(config);
            }
        }
    }

    /**
     * Save the active build config name to persistent storage.
     */
    protected saveActiveConfiguration(config: CppBuildConfiguration | undefined) {
        this.storageService.setData<SavedActiveBuildConfiguration>(
            this.ACTIVE_BUILD_CONFIGURATION_STORAGE_KEY, {
                configName: config ? config.name : undefined,
            });
    }

    /**
     * Update the active build configuration if applicable.
     */
    protected handlePreferencesUpdate(): void {
        const active = this.getActiveConfig();
        const valid = (active)
            ? this.getValidConfigs().some(a => this.equals(a, active))
            : false;
        if (!valid) {
            this.setActiveConfig(undefined);
        }
    }

    /**
     * Determine if two `CppBuildConfiguration` are equal.
     *
     * @param a `CppBuildConfiguration`.
     * @param b `CppBuildConfiguration`.
     */
    protected equals(a: CppBuildConfiguration, b: CppBuildConfiguration): boolean {
        return a.name === b.name && a.directory === b.directory;
    }

    getActiveConfig(): CppBuildConfiguration | undefined {
        return this.activeConfig;
    }

    setActiveConfig(config: CppBuildConfiguration | undefined) {
        this.activeConfig = config;
        this.saveActiveConfiguration(config);
        this.activeConfigChangeEmitter.fire(config);
    }

    get onActiveConfigChange(): Event<CppBuildConfiguration | undefined> {
        return this.activeConfigChangeEmitter.event;
    }

    getConfigs(): CppBuildConfiguration[] {
        return this.cppPreferences[CPP_BUILD_CONFIGURATIONS_PREFERENCE_KEY] || [];
    }

    getValidConfigs(): CppBuildConfiguration[] {
        return Array.from(this.getConfigs())
            .filter(a => a.name !== '' && a.directory !== '')
            .sort((a, b) => (a.name.localeCompare(b.name)));
    }
}

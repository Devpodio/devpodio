/********************************************************************************
 * Copyright (C) 2018 Ericsson
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

import { injectable, inject } from 'inversify';
import { TaskConfiguration } from '@theia/task/lib/common';
import { ProcessTaskConfiguration } from '@theia/task/src/common/process/task-protocol';
import { TaskContribution, TaskProvider, TaskResolver, TaskProviderRegistry, TaskResolverRegistry } from '@theia/task/lib/browser';
import { CppBuildConfigurationManager } from './cpp-build-configurations';

@injectable()
export class CppBuildManagementTaskProvider implements TaskContribution, TaskProvider, TaskResolver {

    @inject(CppBuildConfigurationManager) protected readonly configManager: CppBuildConfigurationManager;
    @inject(TaskResolverRegistry) protected readonly taskResolverRegistry: TaskResolverRegistry;

    registerProviders(registry: TaskProviderRegistry) {
        registry.register('cpp.build', this);
    }

    registerResolvers(registry: TaskResolverRegistry) {
        registry.register('cpp.build', this);
    }

    async provideTasks(): Promise<TaskConfiguration[]> {
        return this.configManager.getConfigs().map(config => {
            const command = config.command || 'echo NOOP';
            const args = command.split(' ').map(item => item.trim());
            return <ProcessTaskConfiguration | TaskConfiguration>{
                type: 'cpp.build',
                label: config.name,
                command: args[0],
                args: args.splice(1),
            };
        });
    }

    async resolveTask(task: TaskConfiguration): Promise<TaskConfiguration> {
        return this.taskResolverRegistry.getResolver('shell')!
            .resolveTask({ ...task, type: 'shell' });
    }
}

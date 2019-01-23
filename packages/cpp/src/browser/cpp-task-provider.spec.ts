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

import { Container, injectable } from 'inversify';
import { CppTaskProvider } from './cpp-task-provider';
import { TaskResolverRegistry } from '@devpodio/task/lib/browser/task-contribution';
import { CppBuildConfigurationManager, CppBuildConfiguration } from './cpp-build-configurations';
import { Event } from '@devpodio/core';
import { expect } from 'chai';
import { TaskConfiguration } from '@devpodio/task/src/common';
import { ProcessTaskConfiguration } from '@devpodio/task/lib/common/process/task-protocol';

// The object under test.
let taskProvider: CppTaskProvider;

@injectable()
class MockCppBuildConfigurationManager implements CppBuildConfigurationManager {
    getConfigs(): CppBuildConfiguration[] {
        return [{
            name: 'Build 1',
            directory: '/tmp/build1',
        }, {
            name: 'Build 2',
            directory: '/tmp/build2',
            commands: {
                build: 'very complex command',
            }
        }];
    }

    getValidConfigs(): CppBuildConfiguration[] {
        return this.getConfigs();
    }

    /** Get the active build configuration.  */
    getActiveConfig(): CppBuildConfiguration | undefined {
        return undefined;
    }

    /** Change the active build configuration.  */
    setActiveConfig(config: CppBuildConfiguration | undefined): void { }

    /** Event emitted when the active build configuration changes.  */
    onActiveConfigChange: Event<CppBuildConfiguration | undefined>;

    /**
     * Promise resolved when the list of build configurations has been read
     * once, and the active configuration has been set, if relevant.
     */
    ready: Promise<void> = Promise.resolve();
}

beforeEach(function () {
    const container: Container = new Container();
    container.bind(CppTaskProvider).toSelf().inSingletonScope();
    container.bind(TaskResolverRegistry).toSelf().inSingletonScope();
    container.bind(CppBuildConfigurationManager).to(MockCppBuildConfigurationManager);
    taskProvider = container.get(CppTaskProvider);

    // Register a task resolver of type 'shell', on which the cpp build tasks
    // depend.  Just return the task as-is, since we only need to verify what
    // CppTaskProvider passed to the shell task resolver.
    container.get(TaskResolverRegistry).register('shell', {
        async resolveTask(task: TaskConfiguration): Promise<TaskConfiguration> {
            return task;
        }
    });
});

describe('CppTaskProvider', function () {
    it('provide a task for each build config with a build command', async function () {
        const tasks = await taskProvider.provideTasks();
        expect(tasks).length(1);
        expect(tasks[0].config.name === 'Build 1');

        const resolvedTask = await taskProvider.resolveTask(tasks[0]);
        expect(resolvedTask.type === 'shell');
        expect((<ProcessTaskConfiguration>resolvedTask).cwd === '/tmp/build1');
        expect((<ProcessTaskConfiguration>resolvedTask).command === 'very');
        expect((<ProcessTaskConfiguration>resolvedTask).args).to.deep.equal(['complex', 'command']);
    });
});

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

import { ContainerModule, interfaces } from 'inversify';
import { OutlineViewService } from './outline-view-service';
import { OutlineViewContribution } from './outline-view-contribution';
import { WidgetFactory } from '@devpodio/core/lib/browser/widget-manager';
import {
    FrontendApplicationContribution,
    createTreeContainer,
    TreeWidget,
    bindViewContribution,
    TreeProps,
    defaultTreeProps,
    TreeDecoratorService
} from '@devpodio/core/lib/browser';
import { OutlineViewWidgetFactory, OutlineViewWidget } from './outline-view-widget';
import '../../src/browser/styles/index.css';
import { bindContributionProvider } from '@devpodio/core/lib/common/contribution-provider';
import { OutlineDecoratorService, OutlineTreeDecorator } from './outline-decorator-service';

export default new ContainerModule(bind => {
    bind(OutlineViewWidgetFactory).toFactory(ctx =>
        () => createOutlineViewWidget(ctx.container)
    );

    bind(OutlineViewService).toSelf().inSingletonScope();
    bind(WidgetFactory).toService(OutlineViewService);

    bindViewContribution(bind, OutlineViewContribution);
    bind(FrontendApplicationContribution).toService(OutlineViewContribution);
});

function createOutlineViewWidget(parent: interfaces.Container): OutlineViewWidget {
    const child = createTreeContainer(parent);

    child.rebind(TreeProps).toConstantValue({ ...defaultTreeProps, search: true });

    child.unbind(TreeWidget);
    child.bind(OutlineViewWidget).toSelf();

    child.bind(OutlineDecoratorService).toSelf().inSingletonScope();
    child.rebind(TreeDecoratorService).toDynamicValue(ctx => ctx.container.get(OutlineDecoratorService)).inSingletonScope();
    bindContributionProvider(child, OutlineTreeDecorator);

    return child.get(OutlineViewWidget);
}

/********************************************************************************
 * Copyright (C) 2018 TypeFox and others.
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

import { inject, injectable } from 'inversify';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';
import URI from '@devpodio/core/lib/common/uri';
import { notEmpty } from '@devpodio/core/lib/common/objects';
import { Event, Emitter } from '@devpodio/core/lib/common/event';
import { Tree } from '@devpodio/core/lib/browser/tree/tree';
import { DepthFirstTreeIterator } from '@devpodio/core/lib/browser/tree/tree-iterator';
import { TreeDecorator, TreeDecoration } from '@devpodio/core/lib/browser/tree/tree-decorator';
import { FileStatNode } from '@devpodio/filesystem/lib/browser';
import { Marker } from '../../common/marker';
import { ProblemManager } from './problem-manager';

@injectable()
export class ProblemDecorator implements TreeDecorator {

    readonly id = 'theia-problem-decorator';

    protected readonly emitter: Emitter<(tree: Tree) => Map<string, TreeDecoration.Data>>;

    constructor(@inject(ProblemManager) protected readonly problemManager: ProblemManager) {
        this.emitter = new Emitter();
        this.problemManager.onDidChangeMarkers(() => this.fireDidChangeDecorations((tree: Tree) => this.collectDecorators(tree)));
    }

    async decorations(tree: Tree): Promise<Map<string, TreeDecoration.Data>> {
        return this.collectDecorators(tree);
    }

    get onDidChangeDecorations(): Event<(tree: Tree) => Map<string, TreeDecoration.Data>> {
        return this.emitter.event;
    }

    protected fireDidChangeDecorations(event: (tree: Tree) => Map<string, TreeDecoration.Data>): void {
        this.emitter.fire(event);
    }

    protected collectDecorators(tree: Tree): Map<string, TreeDecoration.Data> {
        const result = new Map();
        if (tree.root === undefined) {
            return result;
        }
        const markers = this.appendContainerMarkers(tree, this.collectMarkers(tree));
        for (const node of new DepthFirstTreeIterator(tree.root)) {
            const nodeUri = FileStatNode.getUri(node);
            if (nodeUri) {
                const marker = markers.get(nodeUri);
                if (marker) {
                    result.set(node.id, marker);
                }
            }
        }
        return new Map(Array.from(result.entries()).map(m => [m[0], this.toDecorator(m[1])] as [string, TreeDecoration.Data]));
    }

    protected appendContainerMarkers(tree: Tree, markers: Marker<Diagnostic>[]): Map<string, Marker<Diagnostic>> {
        const result: Map<string, Marker<Diagnostic>> = new Map();
        // We traverse up and assign the diagnostic to the container directory.
        // Note, instead of stopping at the WS root, we traverse up the driver root.
        // We will filter them later based on the expansion state of the tree.
        for (const [uri, marker] of new Map(markers.map(m => [new URI(m.uri), m] as [URI, Marker<Diagnostic>])).entries()) {
            const uriString = uri.toString();
            result.set(uriString, marker);
            let parentUri: URI | undefined = uri.parent;
            while (parentUri && !parentUri.path.isRoot) {
                const parentUriString = parentUri.toString();
                const existing = result.get(parentUriString);
                // Make sure the highest diagnostic severity (smaller number) will be propagated to the container directory.
                if (existing === undefined || this.compare(marker, existing) < 0) {
                    result.set(parentUriString, {
                        data: marker.data,
                        uri: parentUriString,
                        owner: marker.owner,
                        kind: marker.kind
                    });
                    parentUri = parentUri.parent;
                } else {
                    parentUri = undefined;
                }
            }
        }
        return result;
    }

    protected collectMarkers(tree: Tree): Marker<Diagnostic>[] {
        return Array.from(this.problemManager.getUris())
            .map(uri => new URI(uri))
            .map(uri => this.problemManager.findMarkers({ uri }))
            .map(markers => markers.sort(this.compare.bind(this)))
            .map(markers => markers.shift())
            .filter(notEmpty)
            .filter(this.filterMarker.bind(this));
    }

    protected toDecorator(marker: Marker<Diagnostic>): TreeDecoration.Data {
        const position = TreeDecoration.IconOverlayPosition.BOTTOM_RIGHT;
        const icon = this.getOverlayIcon(marker);
        const color = this.getOverlayIconColor(marker);
        return {
            iconOverlay: {
                position,
                icon,
                color,
                background: {
                    shape: 'circle',
                    color: 'var(--theia-layout-color0)'
                }
            }
        };
    }

    protected getOverlayIcon(marker: Marker<Diagnostic>): string {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 'times-circle';
            case 2: return 'exclamation-circle';
            case 3: return 'info-circle';
            default: return 'hand-o-up';
        }
    }

    protected getOverlayIconColor(marker: Marker<Diagnostic>): TreeDecoration.Color {
        const { severity } = marker.data;
        switch (severity) {
            case 1: return 'var(--theia-error-color0)';
            case 2: return 'var(--theia-warn-color0)';
            case 3: return 'var(--theia-info-color0)';
            default: return 'var(--theia-success-color0)';
        }
    }

    /**
     * Returns `true` if the diagnostic (`data`) of the marker argument has `Error`, `Warning`, or `Information` severity.
     * Otherwise, returns `false`.
     */
    protected filterMarker(marker: Marker<Diagnostic>): boolean {
        const { severity } = marker.data;
        return severity === DiagnosticSeverity.Error
            || severity === DiagnosticSeverity.Warning
            || severity === DiagnosticSeverity.Information;
    }

    protected compare(left: Marker<Diagnostic>, right: Marker<Diagnostic>): number {
        return ProblemDecorator.severityCompare(left, right);
    }

}

export namespace ProblemDecorator {

    // Highest severities (errors) come first, then the others. Undefined severities treated as the last ones.
    export const severityCompare = (left: Marker<Diagnostic>, right: Marker<Diagnostic>): number =>
        (left.data.severity || Number.MAX_SAFE_INTEGER) - (right.data.severity || Number.MAX_SAFE_INTEGER);

}

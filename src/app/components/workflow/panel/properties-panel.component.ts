import { ChangeDetectionStrategy, Component, computed, effect, inject, input, untracked } from '@angular/core';
import { LucideAngularModule, Trash2 } from 'lucide-angular';
import { getActionType, getNodeDisplayName, getTriggerType } from '../../../lib/nodes';
import { PanelTab } from '../../../machines/workflow-editor.machine';
import { UiStateService } from '../../../services/ui-state.service';
import { WorkflowEditorService } from '../../../services/workflow-editor.service';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { TabItem, Tabs } from '../../ui/tabs';
import { EditorActions } from '../editor-actions.service';
import { CodeTab } from './code-tab.component';
import { NodeProperties } from './node-properties.component';
import { RunsTab } from './runs-tab.component';
import { WorkflowSettings } from './workflow-settings.component';

export type PanelMode = 'multi' | 'edge' | 'workflow' | 'node';

/** Context-sensitive panel content, shared by the desktop side panel and the mobile overlay (05). */
@Component({
  selector: 'ngf-properties-panel',
  imports: [LucideAngularModule, Button, Input, Label, Tabs, NodeProperties, WorkflowSettings, CodeTab, RunsTab],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex h-full min-h-0 flex-col bg-background', 'data-testid': 'properties-panel' },
  template: `
    @switch (mode()) {
      @case ('multi') {
        <header class="flex h-14 shrink-0 items-center border-b px-4 font-semibold" [class.hidden]="hideHeader()">Properties</header>
        <div class="flex flex-col gap-3 p-4">
          <span ngfLabel>Selection</span>
          <p class="text-sm text-muted-foreground">{{ selectionSummary() }}</p>
          @if (editor.isOwner()) {
            <button
              ngfButton
              variant="ghost"
              size="sm"
              type="button"
              class="w-fit text-destructive hover:text-destructive"
              [disabled]="!editor.canEdit()"
              (click)="actions.deleteSelection()"
            >
              <lucide-icon [img]="TrashIcon" [size]="16" />
              Delete
            </button>
          }
        </div>
      }
      @case ('edge') {
        @if (editor.selectedEdge(); as edge) {
          <header class="flex h-14 shrink-0 items-center border-b px-4 font-semibold" [class.hidden]="hideHeader()">Properties</header>
          <div class="flex flex-col gap-4 p-4">
            <div class="flex flex-col gap-2">
              <label ngfLabel for="edge-id">Edge ID</label>
              <input ngfInput id="edge-id" class="font-mono text-xs" readonly [value]="edge.id" />
            </div>
            <div class="flex flex-col gap-2">
              <label ngfLabel for="edge-source">Source</label>
              <input ngfInput id="edge-source" readonly [value]="actions.nodeLabel(edge.source)" />
            </div>
            <div class="flex flex-col gap-2">
              <label ngfLabel for="edge-target">Target</label>
              <input ngfInput id="edge-target" readonly [value]="actions.nodeLabel(edge.target)" />
            </div>
            @if (editor.isOwner()) {
              <button
                ngfButton
                variant="ghost"
                size="sm"
                type="button"
                class="w-fit text-destructive hover:text-destructive"
                [disabled]="!editor.canEdit()"
                (click)="actions.deleteEdge(edge.id, 'Delete Edge')"
              >
                <lucide-icon [img]="TrashIcon" [size]="16" />
                Delete
              </button>
            }
          </div>
        }
      }
      @default {
        <header class="flex h-14 shrink-0 items-stretch border-b px-4">
          <ngf-tabs [tabs]="tabs()" [value]="ui.activeTab()" (valueChange)="ui.activeTab.set($any($event))" />
        </header>
        <div class="flex min-h-0 flex-1 flex-col" role="tabpanel" [attr.aria-labelledby]="'tab-' + ui.activeTab()">
          @switch (ui.activeTab()) {
            @case ('code') {
              <ngf-code-tab />
            }
            @case ('runs') {
              <ngf-runs-tab />
            }
            @default {
              @if (editor.selectedNode(); as node) {
                <ngf-node-properties [node]="node" />
              } @else {
                <ngf-workflow-settings />
              }
            }
          }
        </div>
      }
    }
  `
})
export class PropertiesPanel {
  /** The mobile overlay shows its own title, so headers without tabs are hidden there. */
  readonly hideHeader = input(false);

  protected readonly editor = inject(WorkflowEditorService);
  protected readonly ui = inject(UiStateService);
  protected readonly actions = inject(EditorActions);

  /** PP-01: multi-selection, then edge, then nothing selected, then node. */
  readonly mode = computed<PanelMode>(() => {
    const nodes = this.editor.selectedNodes().length;
    const edges = this.editor.selectedEdges().length;
    if (nodes + edges > 1) {
      return 'multi';
    }
    if (edges === 1) {
      return 'edge';
    }
    return nodes === 0 ? 'workflow' : 'node';
  });

  private readonly codeHidden = computed(() => {
    const node = this.editor.selectedNode();
    if (!node) {
      return false;
    }
    return node.type === 'trigger' ? getTriggerType(node) === 'Manual' : getActionType(node) === 'Condition';
  });

  protected readonly tabs = computed<TabItem[]>(() => {
    const tabs: TabItem[] = [{ value: 'properties', label: 'Properties' }];
    if (!this.codeHidden()) {
      tabs.push({ value: 'code', label: 'Code' });
    }
    if (this.editor.isOwner()) {
      tabs.push({ value: 'runs', label: 'Runs' });
    }
    return tabs;
  });

  protected readonly selectionSummary = computed(() => {
    const n = this.editor.selectedNodes().length;
    const m = this.editor.selectedEdges().length;
    const parts: string[] = [];
    if (n) {
      parts.push(`${n} ${n === 1 ? 'node' : 'nodes'}`);
    }
    if (m) {
      parts.push(`${m} ${m === 1 ? 'line' : 'lines'}`);
    }
    return `${parts.join(' and ')} selected`;
  });

  constructor() {
    // Fall back to Properties when the active tab isn't available for this selection (PP-03).
    effect(() => {
      const available = this.tabs().map((t) => t.value);
      const active = this.ui.activeTab();
      if (!available.includes(active)) {
        untracked(() => this.ui.activeTab.set('properties' as PanelTab));
      }
    });
  }

  /** Header title for the mobile overlay (SHELL-11). */
  readonly title = computed(() => {
    const mode = this.mode();
    if (mode === 'edge') {
      return 'Connection';
    }
    if (mode === 'multi') {
      return 'Properties';
    }
    return { properties: 'Properties', code: 'Code', runs: 'Runs' }[this.ui.activeTab()];
  });

  protected readonly TrashIcon = Trash2;
  protected readonly nodeName = getNodeDisplayName;
}

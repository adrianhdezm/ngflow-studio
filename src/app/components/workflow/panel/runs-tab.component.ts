import { Clipboard } from '@angular/cdk/clipboard';
import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  Eraser,
  ExternalLink,
  LoaderCircle,
  LucideAngularModule,
  Play,
  RefreshCw,
  X
} from 'lucide-angular';
import { getAction } from '../../../actions/registry';
import { formatDuration, formatRelativeTime, pluralize, toJson } from '../../../lib/format';
import { ExecutionLog, WorkflowExecution } from '../../../models/workflow';
import { WORKFLOW_SERVICE } from '../../../services/workflow.service';
import { WorkflowEditorService } from '../../../services/workflow-editor.service';
import { Button } from '../../ui/button';
import { OverlayService, confirm } from '../../ui/dialog';
import { Spinner } from '../../ui/spinner';
import { ToastService } from '../../ui/toast';
import { JsonView } from './json-view.component';

interface Preview {
  type: 'image' | 'video' | 'url';
  src: string;
}

/** Runs tab: run history, per-step timeline, inputs/outputs (RUN-06 to RUN-12). */
@Component({
  selector: 'ngf-runs-tab',
  imports: [NgTemplateOutlet, LucideAngularModule, Button, Spinner, JsonView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <div class="flex items-center justify-end gap-1 border-b px-3 py-2">
      <button ngfButton variant="ghost" size="sm" type="button" (click)="refresh(true)" [disabled]="refreshing()">
        <lucide-icon [img]="RefreshIcon" [size]="14" [class.animate-spin]="refreshing()" />
        Refresh
      </button>
      <button ngfButton variant="ghost" size="sm" type="button" [disabled]="runs().length === 0" (click)="clearAll()">
        <lucide-icon [img]="EraserIcon" [size]="14" />
        Clear All
      </button>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto p-3">
      @if (loading()) {
        <div class="flex justify-center py-10"><ngf-spinner [size]="20" /></div>
      } @else if (runs().length === 0) {
        <div class="flex flex-col items-center gap-2 rounded-md border border-dashed p-8 text-center">
          <lucide-icon [img]="PlayIcon" [size]="24" class="text-muted-foreground" />
          <p class="text-sm font-medium">No runs yet</p>
          <p class="text-xs text-muted-foreground">Execute your workflow to see runs here</p>
        </div>
      } @else {
        <ol class="flex flex-col gap-2">
          @for (run of runs(); track run.id; let i = $index) {
            <li
              class="overflow-hidden rounded-md border bg-card"
              [class.ring-2]="run.id === editor.selectedExecutionId()"
              [class.ring-primary]="run.id === editor.selectedExecutionId()"
              [class.ring-offset-2]="run.id === editor.selectedExecutionId()"
              [class.ring-offset-background]="run.id === editor.selectedExecutionId()"
            >
              <div class="flex items-center gap-3 p-3">
                <button
                  type="button"
                  class="cursor-pointer"
                  [attr.aria-label]="'Expand run ' + (runs().length - i)"
                  (click)="toggleRun(run.id)"
                >
                  <ng-container *ngTemplateOutlet="statusDot; context: { $implicit: run.status }" />
                </button>
                <button
                  type="button"
                  class="flex min-w-0 flex-1 cursor-pointer flex-col items-start text-left"
                  [attr.aria-pressed]="run.id === editor.selectedExecutionId()"
                  title="Show this run on the canvas"
                  (click)="selectRun(run.id)"
                >
                  <span class="text-sm font-medium">Run #{{ runs().length - i }}</span>
                  <span class="truncate font-mono text-xs text-muted-foreground">
                    {{ relative(run.startedAt) }} • {{ duration(run) }} • {{ stepCount(run.id) }}
                  </span>
                </button>
                <button
                  ngfButton
                  variant="ghost"
                  size="icon-sm"
                  type="button"
                  [attr.aria-label]="expandedRuns().has(run.id) ? 'Collapse run' : 'Expand run'"
                  [attr.aria-expanded]="expandedRuns().has(run.id)"
                  (click)="toggleRun(run.id)"
                >
                  <lucide-icon [img]="expandedRuns().has(run.id) ? DownIcon : RightIcon" [size]="16" />
                </button>
              </div>

              @if (expandedRuns().has(run.id)) {
                <div class="border-t bg-muted/40 p-3">
                  @if (logsFor(run.id); as logs) {
                    @if (logs.length === 0) {
                      <p class="text-xs text-muted-foreground">No steps recorded</p>
                    } @else {
                      <ol class="relative flex flex-col gap-1">
                        @for (log of logs; track log.id; let last = $last) {
                          <li class="relative pl-7">
                            @if (!last) {
                              <span class="absolute top-6 bottom-[-0.25rem] left-[9px] w-px bg-border" aria-hidden="true"></span>
                            }
                            <span class="absolute top-1.5 left-0">
                              <ng-container *ngTemplateOutlet="statusDot; context: { $implicit: log.status }" />
                            </span>
                            <button
                              type="button"
                              class="flex w-full cursor-pointer items-center gap-1.5 py-1.5 text-left text-sm"
                              [attr.aria-expanded]="expandedSteps().has(log.id)"
                              (click)="toggleStep(log.id)"
                            >
                              <lucide-icon
                                [img]="expandedSteps().has(log.id) ? DownIcon : RightIcon"
                                [size]="14"
                                class="text-muted-foreground"
                              />
                              <span class="min-w-0 flex-1 truncate">{{ log.nodeName }}</span>
                              <span class="font-mono text-xs text-muted-foreground">{{ formatDuration(log.duration) }}</span>
                            </button>
                            @if (expandedSteps().has(log.id)) {
                              <div class="flex flex-col gap-2 pb-2">
                                @if (preview(log); as p) {
                                  <ng-container
                                    *ngTemplateOutlet="
                                      section;
                                      context: { key: log.id + ':result', label: 'Result', data: p.src, defaultOpen: true, preview: p }
                                    "
                                  />
                                }
                                <ng-container
                                  *ngTemplateOutlet="
                                    section;
                                    context: { key: log.id + ':input', label: 'Input', data: log.input, defaultOpen: false }
                                  "
                                />
                                @if (log.output !== undefined) {
                                  <ng-container
                                    *ngTemplateOutlet="
                                      section;
                                      context: { key: log.id + ':output', label: 'Output', data: log.output, defaultOpen: false }
                                    "
                                  />
                                }
                                @if (log.error) {
                                  <ng-container
                                    *ngTemplateOutlet="
                                      section;
                                      context: { key: log.id + ':error', label: 'Error', data: log.error, defaultOpen: true, error: true }
                                    "
                                  />
                                }
                              </div>
                            }
                          </li>
                        }
                      </ol>
                    }
                  } @else {
                    <div class="flex justify-center py-2"><ngf-spinner /></div>
                  }
                </div>
              }
            </li>
          }
        </ol>
      }
    </div>

    <ng-template #statusDot let-status>
      <span
        class="flex size-5 shrink-0 items-center justify-center rounded-full text-white"
        [class.bg-green-500]="status === 'success'"
        [class.bg-red-500]="status === 'error'"
        [class.bg-blue-500]="status === 'running'"
        [class.bg-muted-foreground]="status === 'pending'"
        [attr.title]="status"
      >
        @switch (status) {
          @case ('success') {
            <lucide-icon [img]="CheckIcon" [size]="12" [strokeWidth]="3" />
          }
          @case ('error') {
            <lucide-icon [img]="XIcon" [size]="12" [strokeWidth]="3" />
          }
          @case ('running') {
            <lucide-icon [img]="LoaderIcon" [size]="12" class="animate-spin" />
          }
          @default {
            <lucide-icon [img]="ClockIcon" [size]="12" />
          }
        }
      </span>
    </ng-template>

    <ng-template
      #section
      let-key="key"
      let-label="label"
      let-data="data"
      let-defaultOpen="defaultOpen"
      let-error="error"
      let-preview="preview"
    >
      <div class="flex flex-col gap-1">
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="flex flex-1 cursor-pointer items-center gap-1 text-xs font-medium text-muted-foreground"
            [attr.aria-expanded]="isOpen(key, defaultOpen)"
            (click)="toggleSection(key, defaultOpen)"
          >
            <lucide-icon [img]="isOpen(key, defaultOpen) ? DownIcon : RightIcon" [size]="12" />
            {{ label }}
          </button>
          @if (preview?.type === 'url') {
            <a
              [href]="preview.src"
              target="_blank"
              rel="noopener noreferrer"
              class="rounded p-1 text-muted-foreground hover:bg-accent"
              aria-label="Open in new tab"
              title="Open in new tab"
            >
              <lucide-icon [img]="ExternalIcon" [size]="12" />
            </a>
          }
          <button
            type="button"
            class="cursor-pointer rounded p-1 text-muted-foreground hover:bg-accent"
            [attr.aria-label]="'Copy ' + label"
            [title]="'Copy ' + label"
            (click)="copy(data)"
          >
            <lucide-icon [img]="CopyIcon" [size]="12" />
          </button>
        </div>
        @if (isOpen(key, defaultOpen)) {
          @if (preview) {
            @switch (preview.type) {
              @case ('image') {
                <img [src]="preview.src" alt="Step output" class="max-h-60 w-fit rounded-md border" />
              }
              @case ('video') {
                <video [src]="preview.src" controls class="max-h-60 rounded-md border"></video>
              }
              @default {
                <a
                  [href]="preview.src"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="truncate text-xs text-blue-600 underline dark:text-blue-400"
                  >{{ preview.src }}</a
                >
              }
            }
          } @else {
            <ngf-json-view [value]="data" [tone]="error ? 'error' : 'default'" />
          }
        }
      </div>
    </ng-template>
  `
})
export class RunsTab {
  protected readonly editor = inject(WorkflowEditorService);
  private readonly service = inject(WORKFLOW_SERVICE);
  private readonly overlays = inject(OverlayService);
  private readonly clipboard = inject(Clipboard);
  private readonly toasts = inject(ToastService);

  protected readonly runs = signal<WorkflowExecution[]>([]);
  protected readonly loading = signal(true);
  protected readonly refreshing = signal(false);
  protected readonly expandedRuns = signal(new Set<string>());
  protected readonly expandedSteps = signal(new Set<string>());
  private readonly logs = signal<Record<string, ExecutionLog[]>>({});
  private readonly sections = signal<Record<string, boolean>>({});
  private readonly now = signal(Date.now());

  protected readonly formatDuration = formatDuration;

  constructor() {
    // Reload when a run starts or finishes, or the workflow changes.
    effect(() => {
      this.editor.runsVersion();
      this.editor.workflowId();
      untracked(() => void this.refresh(false));
    });
    // Auto-refresh while the tab is visible (RUN-12).
    const timer = setInterval(() => {
      this.now.set(Date.now());
      void this.refresh(false);
    }, 2000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  async refresh(manual: boolean): Promise<void> {
    const id = this.editor.workflowId();
    if (!id) {
      this.loading.set(false);
      return;
    }
    if (manual) {
      this.refreshing.set(true);
    }
    try {
      const runs = await this.service.listExecutions(id);
      this.runs.set(runs);
      // Logs give the step counts and the expanded timelines; the list is short, so load them all.
      const entries = await Promise.all(
        runs.slice(0, 50).map(async (run) => [run.id, await this.service.getExecutionLogs(run.id)] as const)
      );
      this.logs.update((current) => ({ ...current, ...Object.fromEntries(entries.map(([k, v]) => [k, sortLogs(v)])) }));
    } catch (error) {
      console.error('Failed to load runs', error);
    } finally {
      this.loading.set(false);
      this.refreshing.set(false);
    }
  }

  protected relative(iso: string): string {
    return formatRelativeTime(iso, this.now());
  }

  protected duration(run: WorkflowExecution): string {
    if (run.duration) {
      return formatDuration(run.duration);
    }
    return run.status === 'running' ? formatDuration(this.now() - new Date(run.startedAt).getTime()) : '-';
  }

  protected stepCount(runId: string): string {
    const logs = this.logs()[runId];
    return logs ? pluralize(logs.length, 'step') : '… steps';
  }

  protected logsFor(runId: string): ExecutionLog[] | undefined {
    return this.logs()[runId];
  }

  protected async toggleRun(runId: string): Promise<void> {
    const next = new Set(this.expandedRuns());
    if (next.has(runId)) {
      next.delete(runId);
      this.expandedRuns.set(next);
      return;
    }
    next.add(runId);
    this.expandedRuns.set(next);
    const logs = await this.service.getExecutionLogs(runId);
    this.logs.update((current) => ({ ...current, [runId]: sortLogs(logs) }));
  }

  protected toggleStep(id: string): void {
    const next = new Set(this.expandedSteps());
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    this.expandedSteps.set(next);
  }

  protected isOpen(key: string, defaultOpen: boolean): boolean {
    return this.sections()[key] ?? defaultOpen;
  }

  protected toggleSection(key: string, defaultOpen: boolean): void {
    this.sections.update((s) => ({ ...s, [key]: !this.isOpen(key, defaultOpen) }));
  }

  protected selectRun(runId: string): void {
    this.editor.send({ type: 'SELECT_EXECUTION', id: this.editor.selectedExecutionId() === runId ? null : runId });
  }

  protected preview(log: ExecutionLog): Preview | null {
    const output = log.output as Record<string, unknown> | undefined;
    if (!output || typeof output !== 'object') {
      return null;
    }
    const display = getAction(log.nodeType)?.outputDisplay;
    if (display) {
      const value = output[display.field];
      if (typeof value === 'string' && value) {
        if (display.type === 'image') {
          return {
            type: 'image',
            src:
              value.startsWith('data:') || value.startsWith('http')
                ? value
                : `data:${(output['mimeType'] as string) ?? 'image/png'};base64,${value}`
          };
        }
        return { type: display.type, src: value };
      }
    }
    if (typeof output['base64'] === 'string') {
      return { type: 'image', src: `data:${(output['mimeType'] as string) ?? 'image/png'};base64,${output['base64']}` };
    }
    return null;
  }

  protected copy(data: unknown): void {
    if (this.clipboard.copy(typeof data === 'string' ? data : toJson(data))) {
      this.toasts.success('Copied to clipboard');
    }
  }

  protected clearAll(): void {
    confirm(this.overlays, {
      title: 'Delete All Runs',
      message: 'Are you sure you want to delete all workflow runs? This action cannot be undone.',
      onConfirm: async () => {
        const id = this.editor.workflowId();
        if (!id) {
          return;
        }
        await this.service.deleteExecutions(id);
        this.editor.send({ type: 'EXECUTIONS_CLEARED' });
        this.logs.set({});
        this.expandedRuns.set(new Set());
        await this.refresh(false);
      }
    });
  }

  protected readonly RefreshIcon = RefreshCw;
  protected readonly EraserIcon = Eraser;
  protected readonly PlayIcon = Play;
  protected readonly CheckIcon = Check;
  protected readonly XIcon = X;
  protected readonly LoaderIcon = LoaderCircle;
  protected readonly ClockIcon = Clock;
  protected readonly DownIcon = ChevronDown;
  protected readonly RightIcon = ChevronRight;
  protected readonly CopyIcon = Copy;
  protected readonly ExternalIcon = ExternalLink;
}

function sortLogs(logs: ExecutionLog[]): ExecutionLog[] {
  return [...logs].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

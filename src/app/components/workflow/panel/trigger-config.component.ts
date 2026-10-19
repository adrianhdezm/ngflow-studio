import { Clipboard } from '@angular/cdk/clipboard';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { Copy, LucideAngularModule } from 'lucide-angular';
import { TriggerType, WorkflowNode } from '../../../models/workflow';
import { WorkflowEditorService } from '../../../services/workflow-editor.service';
import { CodeEditor } from '../../code-editor/code-editor.component';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectOption } from '../../ui/select';
import { ToastService } from '../../ui/toast';
import { SchemaBuilder, parseSchema } from '../fields/schema-builder.component';
import { TRIGGER_ICONS } from '../icons';

const TRIGGER_OPTIONS: SelectOption[] = (['Manual', 'Schedule', 'Webhook'] as TriggerType[]).map((t) => ({
  value: t,
  label: t,
  icon: TRIGGER_ICONS[t],
  iconClass: 'text-blue-500'
}));

function timezones(): SelectOption[] {
  let zones: string[];
  try {
    zones = (Intl as unknown as { supportedValuesOf(key: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    zones = ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Madrid', 'Asia/Tokyo'];
  }
  if (!zones.includes('America/New_York')) {
    zones = ['America/New_York', ...zones];
  }
  return zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }));
}

/** Trigger type and its fields (TRG-01 to TRG-03). */
@Component({
  selector: 'ngf-trigger-config',
  imports: [LucideAngularModule, Button, Input, Label, Select, SchemaBuilder, CodeEditor],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <div class="flex flex-col gap-2">
      <span ngfLabel>Trigger Type</span>
      <ngf-select
        inputId="triggerType"
        [options]="triggerOptions"
        [value]="triggerType()"
        [disabled]="disabled()"
        ariaLabel="Trigger Type"
        (valueChange)="set('triggerType', $event)"
      />
    </div>

    @if (triggerType() === 'Webhook') {
      <div class="flex flex-col gap-2">
        <label ngfLabel for="webhookUrl">Webhook URL</label>
        <div class="flex gap-2">
          <input ngfInput id="webhookUrl" class="font-mono text-xs" readonly [value]="webhookUrl()" />
          <button
            ngfButton
            variant="outline"
            size="icon"
            type="button"
            title="Copy webhook URL"
            aria-label="Copy webhook URL"
            [disabled]="!editor.workflowId()"
            (click)="copyUrl()"
          >
            <lucide-icon [img]="CopyIcon" [size]="16" />
          </button>
        </div>
      </div>
      <div class="flex flex-col gap-2">
        <span ngfLabel>Request Schema (Optional)</span>
        <ngf-schema-builder [fields]="schema()" [disabled]="disabled()" (fieldsChange)="set('webhookSchema', stringify($event))" />
        <p class="text-xs text-muted-foreground">Define the expected structure of the incoming webhook payload.</p>
      </div>
      <div class="flex flex-col gap-2">
        <span ngfLabel>Mock Request (Optional)</span>
        <ngf-code-editor
          inputId="webhookMockRequest"
          language="json"
          height="150px"
          [value]="configString('webhookMockRequest')"
          [readOnly]="disabled()"
          (valueChange)="set('webhookMockRequest', $event)"
        />
        <p class="text-xs text-muted-foreground">Enter a sample JSON payload to test the webhook trigger.</p>
      </div>
    }

    @if (triggerType() === 'Schedule') {
      <div class="flex flex-col gap-2">
        <label ngfLabel for="scheduleCron">Cron Expression</label>
        <input
          ngfInput
          id="scheduleCron"
          class="font-mono"
          placeholder="0 9 * * * (every day at 9am)"
          [value]="configString('scheduleCron')"
          [disabled]="disabled()"
          (input)="set('scheduleCron', $any($event.target).value)"
        />
      </div>
      <div class="flex flex-col gap-2">
        <span ngfLabel>Timezone</span>
        <ngf-select
          inputId="scheduleTimezone"
          [options]="timezoneOptions"
          [searchable]="true"
          searchPlaceholder="Search timezones..."
          [value]="configString('scheduleTimezone') || 'America/New_York'"
          [disabled]="disabled()"
          ariaLabel="Timezone"
          (valueChange)="set('scheduleTimezone', $event)"
        />
      </div>
    }
  `
})
export class TriggerConfig {
  readonly node = input.required<WorkflowNode>();
  readonly disabled = input(false);
  readonly configChange = output<Record<string, unknown>>();

  protected readonly editor = inject(WorkflowEditorService);
  private readonly clipboard = inject(Clipboard);
  private readonly toasts = inject(ToastService);

  protected readonly triggerOptions = TRIGGER_OPTIONS;
  protected readonly timezoneOptions = timezones();
  protected readonly CopyIcon = Copy;

  protected readonly config = computed(() => this.node().data.config ?? {});
  protected readonly triggerType = computed(() => (this.config()['triggerType'] as string) ?? 'Manual');
  protected readonly schema = computed(() => parseSchema(this.config()['webhookSchema']));
  protected readonly webhookUrl = computed(() => {
    const id = this.editor.workflowId();
    return id ? `${location.origin}/api/workflows/${id}/webhook` : 'Save workflow to generate webhook URL';
  });

  protected configString(key: string): string {
    const value = this.config()[key];
    return typeof value === 'string' ? value : '';
  }

  protected stringify(value: unknown): string {
    return JSON.stringify(value);
  }

  protected set(key: string, value: unknown): void {
    this.configChange.emit({ ...this.config(), [key]: value });
  }

  protected copyUrl(): void {
    if (this.clipboard.copy(this.webhookUrl())) {
      this.toasts.success('Webhook URL copied to clipboard');
    }
  }
}

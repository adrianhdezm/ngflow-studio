import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { CircleHelp, LucideAngularModule, Plus } from 'lucide-angular';
import { ACTIONS, SYSTEM_CATEGORY, getAction, getCategories, getIntegration } from '../../../actions/registry';
import { getActionType } from '../../../lib/nodes';
import { WorkflowNode } from '../../../models/workflow';
import { ConnectionsStore } from '../../../services/connections.store';
import { CodeEditor } from '../../code-editor/code-editor.component';
import { Button } from '../../ui/button';
import { OverlayService } from '../../ui/dialog';
import { Label } from '../../ui/label';
import { Select, SelectOption } from '../../ui/select';
import { Tooltip } from '../../ui/tooltip';
import { ConfigFields } from '../fields/config-fields.component';
import { SchemaBuilder, parseSchema } from '../fields/schema-builder.component';
import { TemplateInput } from '../fields/template-input.component';
import { iconForAction, iconForCategory } from '../icons';
import { AddConnectionOverlay } from '../overlays/add-connection-overlay.component';

const METHOD_OPTIONS: SelectOption[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map((m) => ({ value: m, label: m }));

/** Configuration form of a configured action (PP-16 to PP-18a). */
@Component({
  selector: 'ngf-action-config',
  imports: [LucideAngularModule, Button, Label, Select, Tooltip, CodeEditor, ConfigFields, SchemaBuilder, TemplateInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    <div class="grid grid-cols-2 gap-3">
      <div class="flex min-w-0 flex-col gap-2">
        <span ngfLabel>Service</span>
        <ngf-select
          [options]="serviceOptions"
          [value]="action()?.category ?? null"
          [disabled]="disabled()"
          ariaLabel="Service"
          (valueChange)="changeService($event)"
        />
      </div>
      <div class="flex min-w-0 flex-col gap-2">
        <span ngfLabel>Action</span>
        <ngf-select
          [options]="actionOptions()"
          [value]="actionType()"
          [disabled]="disabled()"
          ariaLabel="Action"
          (valueChange)="changeAction($event)"
        />
      </div>
    </div>

    @if (action()?.integration && owner()) {
      <div class="flex flex-col gap-2">
        <span ngfLabel>
          Connection
          <lucide-icon
            [img]="HelpIcon"
            [size]="14"
            class="text-muted-foreground"
            ngfTooltip="API key or OAuth credentials for this service"
            tabindex="0"
          />
        </span>
        <div class="flex gap-2">
          <ngf-select
            class="flex-1"
            inputId="integrationId"
            [options]="connectionOptions()"
            [value]="configValue('integrationId')"
            [placeholder]="connectionOptions().length ? 'Select a connection' : 'No ' + integrationLabel() + ' connections'"
            [disabled]="disabled() || connectionOptions().length === 0"
            ariaLabel="Connection"
            (valueChange)="set('integrationId', $event)"
          />
          <button
            ngfButton
            variant="outline"
            size="icon"
            type="button"
            title="Add connection"
            aria-label="Add connection"
            [disabled]="disabled()"
            (click)="addConnection()"
          >
            <lucide-icon [img]="PlusIcon" [size]="16" />
          </button>
        </div>
      </div>
    }

    @switch (actionType()) {
      @case ('HTTP Request') {
        <div class="flex flex-col gap-2">
          <span ngfLabel>Method</span>
          <ngf-select
            inputId="httpMethod"
            [options]="methodOptions"
            [value]="method()"
            [disabled]="disabled()"
            ariaLabel="Method"
            (valueChange)="set('httpMethod', $event)"
          />
        </div>
        <div class="flex flex-col gap-2">
          <label ngfLabel for="endpoint">URL <span class="text-destructive" aria-hidden="true">*</span></label>
          <ngf-template-input
            inputId="endpoint"
            [nodeId]="node().id"
            [value]="configValue('endpoint')"
            [placeholder]="urlPlaceholder"
            [disabled]="disabled()"
            ariaLabel="URL"
            (valueChange)="set('endpoint', $event)"
          />
        </div>
        <div class="flex flex-col gap-2">
          <span ngfLabel>Headers (JSON)</span>
          <ngf-code-editor
            inputId="httpHeaders"
            language="json"
            height="100px"
            [value]="configValue('httpHeaders') || '{}'"
            [readOnly]="disabled()"
            (valueChange)="set('httpHeaders', $event)"
          />
        </div>
        <div class="flex flex-col gap-2" [class.opacity-50]="method() === 'GET'">
          <span ngfLabel>Body (JSON)</span>
          <ngf-code-editor
            inputId="httpBody"
            language="json"
            height="120px"
            [value]="configValue('httpBody') || '{}'"
            [readOnly]="disabled() || method() === 'GET'"
            (valueChange)="set('httpBody', $event)"
          />
          @if (method() === 'GET') {
            <p class="text-xs text-muted-foreground">Body is disabled for GET requests</p>
          }
        </div>
      }
      @case ('Database Query') {
        <div class="flex flex-col gap-2">
          <span ngfLabel>SQL Query <span class="text-destructive" aria-hidden="true">*</span></span>
          <ngf-code-editor
            inputId="dbQuery"
            language="sql"
            height="150px"
            [value]="configValue('dbQuery')"
            [readOnly]="disabled()"
            (valueChange)="set('dbQuery', $event)"
          />
          <p class="text-xs text-muted-foreground">The DATABASE_URL from your project integrations will be used to execute this query.</p>
        </div>
        <div class="flex flex-col gap-2">
          <span ngfLabel>Schema (Optional)</span>
          <ngf-schema-builder [fields]="dbSchema()" [disabled]="disabled()" (fieldsChange)="set('dbSchema', stringify($event))" />
        </div>
      }
      @case ('Condition') {
        <div class="flex flex-col gap-2">
          <label ngfLabel for="condition">Condition Expression <span class="text-destructive" aria-hidden="true">*</span></label>
          <ngf-template-input
            inputId="condition"
            [nodeId]="node().id"
            [value]="configValue('condition')"
            [placeholder]="conditionPlaceholder"
            [disabled]="disabled()"
            ariaLabel="Condition Expression"
            (valueChange)="set('condition', $event)"
          />
          <p class="text-xs text-muted-foreground">
            Enter a JavaScript expression that evaluates to true or false. You can use &#64; to reference previous node outputs.
          </p>
        </div>
      }
      @default {
        @if (action(); as def) {
          <ngf-config-fields
            [fields]="def.configFields"
            [config]="config()"
            [nodeId]="node().id"
            [disabled]="disabled()"
            (fieldChange)="set($event.key, $event.value)"
          />
        }
      }
    }
  `
})
export class ActionConfig {
  readonly node = input.required<WorkflowNode>();
  readonly disabled = input(false);
  readonly owner = input(true);
  readonly configChange = output<Record<string, unknown>>();

  private readonly connections = inject(ConnectionsStore);
  private readonly overlays = inject(OverlayService);

  protected readonly methodOptions = METHOD_OPTIONS;
  protected readonly urlPlaceholder = 'https://api.example.com/endpoint or {{NodeName.url}}';
  protected readonly conditionPlaceholder = 'e.g., 5 > 3, status === 200, {{PreviousNode.value}} > 100';
  protected readonly serviceOptions: SelectOption[] = getCategories().map((category, i) => {
    const icon = iconForCategory(category, ACTIONS.find((a) => a.category === category)?.icon);
    return { value: category, label: category, icon: icon.icon, iconClass: icon.color, separatorBefore: i === 1 };
  });

  protected readonly config = computed(() => this.node().data.config ?? {});
  protected readonly actionType = computed(() => getActionType(this.node()));
  protected readonly action = computed(() => getAction(this.actionType()));
  protected readonly method = computed(() => (this.config()['httpMethod'] as string) || 'POST');
  protected readonly dbSchema = computed(() => parseSchema(this.config()['dbSchema']));
  protected readonly integrationLabel = computed(() => getIntegration(this.action()?.integration)?.label ?? '');

  protected readonly actionOptions = computed<SelectOption[]>(() => {
    const category = this.action()?.category ?? SYSTEM_CATEGORY;
    return ACTIONS.filter((a) => a.category === category).map((a) => {
      const icon = iconForAction(a.id);
      return { value: a.id, label: a.label, icon: icon.icon, iconClass: icon.color };
    });
  });

  protected readonly connectionOptions = computed<SelectOption[]>(() =>
    this.connections.ofType(this.action()?.integration).map((c) => ({ value: c.id, label: c.name }))
  );

  protected configValue(key: string): string {
    const value = this.config()[key];
    return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
  }

  protected stringify(value: unknown): string {
    return JSON.stringify(value);
  }

  protected set(key: string, value: unknown): void {
    this.configChange.emit({ ...this.config(), [key]: value });
  }

  /** Changing Service auto-selects its first action. */
  protected changeService(category: string | null | undefined): void {
    const first = ACTIONS.find((a) => a.category === category);
    if (first && first.id !== this.actionType()) {
      this.changeAction(first.id);
    }
  }

  /** Changing the action keeps only the action type; the connection is cleared. */
  protected changeAction(actionType: string | null | undefined): void {
    if (!actionType || actionType === this.actionType()) {
      return;
    }
    this.configChange.emit({ actionType });
  }

  protected addConnection(): void {
    const type = this.action()?.integration;
    if (!type) {
      return;
    }
    this.overlays.push(
      AddConnectionOverlay,
      { integrationType: type, onCreated: (id: string) => this.set('integrationId', id) },
      { size: 'sm' }
    );
  }

  protected readonly HelpIcon = CircleHelp;
  protected readonly PlusIcon = Plus;
}

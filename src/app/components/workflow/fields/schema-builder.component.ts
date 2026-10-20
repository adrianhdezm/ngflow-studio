import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { LucideAngularModule, Plus, Trash2 } from 'lucide-angular';
import { createId } from '../../../lib/id';
import { SchemaField } from '../../../models/workflow';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectOption } from '../../ui/select';

const TYPE_OPTIONS: SelectOption[] = [
  { value: 'string', label: 'String' },
  { value: 'number', label: 'Number' },
  { value: 'boolean', label: 'Boolean' },
  { value: 'array', label: 'Array' },
  { value: 'object', label: 'Object' }
];

const ITEM_TYPE_OPTIONS: SelectOption[] = TYPE_OPTIONS.filter((o) => o.value !== 'array');

/** Parses a stored schema (JSON string of SchemaField[]); invalid input yields an empty list. */
export function parseSchema(value: unknown): SchemaField[] {
  if (Array.isArray(value)) {
    return value as SchemaField[];
  }
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Recursive editor for a list of SchemaFields (PP-19). */
@Component({
  selector: 'ngf-schema-builder',
  imports: [LucideAngularModule, Button, Input, Label, Select],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-2' },
  template: `
    @for (field of fields(); track field.id ?? $index; let i = $index) {
      <div class="flex flex-col gap-3 rounded-md border p-3">
        <div class="flex items-end gap-2">
          <div class="flex min-w-0 flex-1 flex-col gap-1.5">
            <label ngfLabel class="text-xs" [for]="fieldId(field, i) + '-name'">Property Name</label>
            <input
              ngfInput
              [id]="fieldId(field, i) + '-name'"
              placeholder="propertyName"
              [value]="field.name"
              [disabled]="disabled()"
              (input)="update(i, { name: $any($event.target).value })"
            />
          </div>
          <div class="flex w-28 flex-col gap-1.5">
            <span ngfLabel class="text-xs">Type</span>
            <ngf-select
              [options]="typeOptions"
              [value]="field.type"
              [disabled]="disabled()"
              ariaLabel="Type"
              (valueChange)="changeType(i, $any($event))"
            />
          </div>
          <button
            ngfButton
            variant="ghost"
            size="icon"
            type="button"
            title="Remove property"
            aria-label="Remove property"
            [disabled]="disabled()"
            (click)="remove(i)"
          >
            <lucide-icon [img]="TrashIcon" [size]="16" />
          </button>
        </div>
        @if (field.type === 'array') {
          <div class="flex flex-col gap-1.5">
            <span ngfLabel class="text-xs">Array Item Type</span>
            <ngf-select
              [options]="itemTypeOptions"
              [value]="field.itemType ?? 'string'"
              [disabled]="disabled()"
              ariaLabel="Array Item Type"
              (valueChange)="changeItemType(i, $any($event))"
            />
          </div>
        }
        <div class="flex flex-col gap-1.5">
          <label ngfLabel class="text-xs" [for]="fieldId(field, i) + '-desc'">Description (optional)</label>
          <input
            ngfInput
            [id]="fieldId(field, i) + '-desc'"
            placeholder="Description for the AI"
            [value]="field.description ?? ''"
            [disabled]="disabled()"
            (input)="update(i, { description: $any($event.target).value })"
          />
        </div>
        @if (field.type === 'object' || (field.type === 'array' && field.itemType === 'object')) {
          <div class="flex flex-col gap-2 border-l-2 pl-3">
            <span class="text-xs font-medium text-muted-foreground">{{
              field.type === 'object' ? 'Object Properties' : 'Array Item Properties'
            }}</span>
            <ngf-schema-builder [fields]="field.fields ?? []" [disabled]="disabled()" (fieldsChange)="update(i, { fields: $event })" />
          </div>
        }
      </div>
    }
    <button ngfButton variant="outline" type="button" class="w-full" [disabled]="disabled()" (click)="add()">
      <lucide-icon [img]="PlusIcon" [size]="16" />
      Add Property
    </button>
  `
})
export class SchemaBuilder {
  readonly fields = input<SchemaField[]>([]);
  readonly disabled = input(false);
  readonly fieldsChange = output<SchemaField[]>();

  protected readonly typeOptions = TYPE_OPTIONS;
  protected readonly itemTypeOptions = ITEM_TYPE_OPTIONS;
  protected readonly TrashIcon = Trash2;
  protected readonly PlusIcon = Plus;

  protected fieldId(field: SchemaField, index: number): string {
    return `schema-${field.id ?? index}`;
  }

  protected add(): void {
    this.fieldsChange.emit([...this.fields(), { id: createId(8), name: '', type: 'string' }]);
  }

  protected remove(index: number): void {
    this.fieldsChange.emit(this.fields().filter((_, i) => i !== index));
  }

  protected update(index: number, patch: Partial<SchemaField>): void {
    this.fieldsChange.emit(this.fields().map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  /** Changing the type resets the parts that no longer apply. */
  protected changeType(index: number, type: SchemaField['type']): void {
    const field = this.fields()[index];
    const next: SchemaField = { id: field.id, name: field.name, description: field.description, type };
    if (type === 'array') {
      next.itemType = 'string';
    }
    if (type === 'object') {
      next.fields = [];
    }
    this.fieldsChange.emit(this.fields().map((f, i) => (i === index ? next : f)));
  }

  protected changeItemType(index: number, itemType: NonNullable<SchemaField['itemType']>): void {
    const field = this.fields()[index];
    this.update(index, { itemType, fields: itemType === 'object' ? (field.fields ?? []) : undefined });
  }
}

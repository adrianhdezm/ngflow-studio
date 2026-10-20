import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { ChevronDown, ChevronRight, LucideAngularModule } from 'lucide-angular';
import { flattenFields, isFieldVisible } from '../../../actions/registry';
import { ConfigField, InputConfigField, isInputField } from '../../../models/workflow';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select } from '../../ui/select';
import { SchemaBuilder, parseSchema } from './schema-builder.component';
import { TemplateInput } from './template-input.component';

/** Renders an action's declarative config fields in order (PP-18a). Groups recurse. */
@Component({
  selector: 'ngf-config-fields',
  imports: [LucideAngularModule, Input, Label, Select, SchemaBuilder, TemplateInput],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex flex-col gap-4' },
  template: `
    @for (field of fields(); track $index) {
      @if (isInput(field)) {
        @if (visible(field)) {
          <div class="flex flex-col gap-2">
            <label ngfLabel [for]="field.key">
              {{ field.label }}
              @if (field.required) {
                <span class="text-destructive" aria-hidden="true">*</span>
              }
            </label>
            @switch (field.type) {
              @case ('template-input') {
                <ngf-template-input
                  [inputId]="field.key"
                  [nodeId]="nodeId()"
                  [value]="stringValue(field)"
                  [placeholder]="field.placeholder ?? ''"
                  [disabled]="disabled()"
                  [ariaLabel]="field.label"
                  (valueChange)="set(field.key, $event)"
                />
              }
              @case ('template-textarea') {
                <ngf-template-input
                  [inputId]="field.key"
                  [nodeId]="nodeId()"
                  [multiline]="true"
                  [rows]="field.rows ?? 3"
                  [value]="stringValue(field)"
                  [placeholder]="field.placeholder ?? ''"
                  [disabled]="disabled()"
                  [ariaLabel]="field.label"
                  (valueChange)="set(field.key, $event)"
                />
              }
              @case ('number') {
                <input
                  ngfInput
                  type="number"
                  [id]="field.key"
                  [min]="field.min ?? null"
                  [placeholder]="field.placeholder ?? ''"
                  [value]="stringValue(field)"
                  [disabled]="disabled()"
                  (input)="set(field.key, $any($event.target).value)"
                />
              }
              @case ('select') {
                <ngf-select
                  [inputId]="field.key"
                  [options]="field.options ?? []"
                  [value]="stringValue(field)"
                  [placeholder]="field.placeholder ?? 'Select...'"
                  [disabled]="disabled()"
                  [ariaLabel]="field.label"
                  (valueChange)="set(field.key, $event ?? '')"
                />
              }
              @case ('schema-builder') {
                <ngf-schema-builder [fields]="schema(field)" [disabled]="disabled()" (fieldsChange)="set(field.key, stringify($event))" />
              }
              @default {
                <input
                  ngfInput
                  [id]="field.key"
                  [placeholder]="field.placeholder ?? ''"
                  [value]="stringValue(field)"
                  [disabled]="disabled()"
                  (input)="set(field.key, $any($event.target).value)"
                />
              }
            }
          </div>
        }
      } @else {
        <div class="flex flex-col rounded-md border">
          <button
            type="button"
            class="flex cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm font-medium"
            [attr.aria-expanded]="isExpanded($index, field.defaultExpanded)"
            (click)="toggle($index, field.defaultExpanded)"
          >
            <lucide-icon
              [img]="isExpanded($index, field.defaultExpanded) ? ExpandedIcon : CollapsedIcon"
              [size]="16"
              class="text-muted-foreground"
            />
            {{ field.label }}
          </button>
          @if (isExpanded($index, field.defaultExpanded)) {
            <div class="border-t p-3">
              <ngf-config-fields
                [fields]="field.fields"
                [allFields]="allFieldsResolved()"
                [config]="config()"
                [nodeId]="nodeId()"
                [disabled]="disabled()"
                (fieldChange)="fieldChange.emit($event)"
              />
            </div>
          }
        </div>
      }
    }
  `
})
export class ConfigFields {
  readonly fields = input.required<ConfigField[]>();
  /** All fields of the action, for `showWhen` defaults; defaults to `fields`. */
  readonly allFields = input<InputConfigField[] | undefined>(undefined);
  readonly config = input<Record<string, unknown>>({});
  readonly nodeId = input.required<string>();
  readonly disabled = input(false);
  readonly fieldChange = output<{ key: string; value: unknown }>();

  private readonly expanded = signal<Record<number, boolean>>({});
  protected readonly allFieldsResolved = computed(() => this.allFields() ?? flattenFields(this.fields()));
  protected readonly ExpandedIcon = ChevronDown;
  protected readonly CollapsedIcon = ChevronRight;

  protected isInput(field: ConfigField): field is InputConfigField {
    return isInputField(field);
  }

  protected visible(field: InputConfigField): boolean {
    return isFieldVisible(field, this.config(), this.allFieldsResolved());
  }

  protected stringValue(field: InputConfigField): string {
    const value = this.config()[field.key];
    return value === undefined || value === null ? (field.defaultValue ?? '') : String(value);
  }

  protected schema(field: InputConfigField) {
    return parseSchema(this.config()[field.key]);
  }

  protected stringify(value: unknown): string {
    return JSON.stringify(value);
  }

  protected set(key: string, value: unknown): void {
    this.fieldChange.emit({ key, value });
  }

  protected isExpanded(index: number, defaultExpanded: boolean | undefined): boolean {
    return this.expanded()[index] ?? defaultExpanded ?? true;
  }

  protected toggle(index: number, defaultExpanded: boolean | undefined): void {
    this.expanded.update((e) => ({ ...e, [index]: !this.isExpanded(index, defaultExpanded) }));
  }
}

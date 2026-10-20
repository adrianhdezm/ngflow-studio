import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  effect,
  forwardRef,
  inject,
  input,
  output,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';
import type * as Monaco from 'monaco-editor';
import { ThemeService } from '../../services/theme.service';
import { loadMonaco } from './monaco-loader';

export type CodeLanguage = 'json' | 'sql' | 'typescript';

/** The one shared Monaco wrapper (CE-01). Also a ControlValueAccessor for forms. */
@Component({
  selector: 'ngf-code-editor',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => CodeEditor), multi: true }],
  host: {
    class: 'relative block overflow-hidden rounded-md border',
    '[style.height]': 'height()',
    '[attr.aria-busy]': '!ready()'
  },
  template: `
    @if (!ready()) {
      <div class="absolute inset-0 animate-pulse bg-muted/60" aria-label="Loading editor"></div>
    }
    <div #host class="h-full w-full" [id]="inputId() || null"></div>
  `
})
export class CodeEditor implements ControlValueAccessor {
  readonly value = input<string>('');
  readonly language = input<CodeLanguage>('json');
  readonly readOnly = input(false);
  readonly height = input('150px');
  readonly options = input<Monaco.editor.IStandaloneEditorConstructionOptions>({});
  /** DOM id of the editor host, so validation can focus it. */
  readonly inputId = input<string | undefined>(undefined);
  readonly valueChange = output<string>();

  protected readonly ready = signal(false);
  private readonly host = viewChild.required<ElementRef<HTMLElement>>('host');
  private readonly theme = inject(ThemeService);
  private readonly cvaValue = signal<string | null>(null);
  private readonly cvaDisabled = signal(false);
  private editor: Monaco.editor.IStandaloneCodeEditor | null = null;
  private monaco: typeof Monaco | null = null;
  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  private applyingExternal = false;

  constructor() {
    const destroyRef = inject(DestroyRef);
    let destroyed = false;
    destroyRef.onDestroy(() => {
      destroyed = true;
      this.editor?.getModel()?.dispose();
      this.editor?.dispose();
    });

    afterNextRender(async () => {
      const monaco = await loadMonaco();
      if (destroyed) {
        return;
      }
      this.monaco = monaco;
      const el = this.host().nativeElement;
      const editor = monaco.editor.create(el, {
        value: this.currentValue(),
        language: this.language(),
        readOnly: this.readOnly() || this.cvaDisabled(),
        theme: this.theme.resolved() === 'dark' ? 'ngf-dark' : 'ngf-light',
        minimap: { enabled: false },
        lineNumbers: 'off',
        folding: false,
        fontSize: 12,
        scrollBeyondLastLine: false,
        automaticLayout: false,
        tabSize: 2,
        wordWrap: 'on',
        renderLineHighlight: 'none',
        overviewRulerLanes: 0,
        scrollbar: { alwaysConsumeMouseWheel: false },
        fixedOverflowWidgets: true,
        ...this.options()
      });
      this.editor = editor;
      editor.onDidChangeModelContent(() => {
        if (this.applyingExternal) {
          return;
        }
        const value = editor.getValue();
        this.onChange(value);
        this.valueChange.emit(value);
      });
      editor.onDidBlurEditorWidget(() => this.onTouched());
      const observer = new ResizeObserver(() => editor.layout());
      observer.observe(el);
      destroyRef.onDestroy(() => observer.disconnect());
      this.ready.set(true);
    });

    // Outside value changes update the editor, without fighting the user's own typing.
    effect(() => {
      const value = this.currentValue();
      untracked(() => {
        if (this.editor && this.editor.getValue() !== value && !this.editor.hasTextFocus()) {
          this.applyingExternal = true;
          this.editor.setValue(value);
          this.applyingExternal = false;
        }
      });
    });
    effect(() => {
      const readOnly = this.readOnly() || this.cvaDisabled();
      const options = this.options();
      untracked(() => this.editor?.updateOptions({ ...options, readOnly }));
    });
    effect(() => {
      const theme = this.theme.resolved() === 'dark' ? 'ngf-dark' : 'ngf-light';
      untracked(() => this.monaco?.editor.setTheme(theme));
    });
    effect(() => {
      const language = this.language();
      untracked(() => {
        const model = this.editor?.getModel();
        if (model && this.monaco) {
          this.monaco.editor.setModelLanguage(model, language);
        }
      });
    });
  }

  private currentValue(): string {
    return this.cvaValue() ?? this.value() ?? '';
  }

  writeValue(value: string | null): void {
    this.cvaValue.set(value ?? '');
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(disabled: boolean): void {
    this.cvaDisabled.set(disabled);
  }
}

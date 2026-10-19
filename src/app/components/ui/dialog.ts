import { DIALOG_DATA, Dialog, DialogRef } from '@angular/cdk/dialog';
import { NgComponentOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, Injectable, InjectionToken, Type, computed, inject, input, signal } from '@angular/core';
import { ArrowLeft, LucideAngularModule, X } from 'lucide-angular';
import { Button, ButtonVariant } from './button';
import { Spinner } from './spinner';

export interface OverlayAction {
  label: string;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  onClick: () => unknown;
}

export interface OverlayOptions {
  size?: 'sm' | 'md' | 'lg' | 'full';
  /** Called when the overlay closes for any reason. */
  onClose?: () => void;
}

interface OverlayEntry {
  component: Type<unknown>;
  props: Record<string, unknown>;
  options: OverlayOptions;
  closing: ReturnType<typeof signal<boolean>>;
  ref?: DialogRef<unknown, OverlayShell>;
}

/** What content rendered inside an overlay can inject. */
export interface OverlayHandle {
  close(): void;
  back(): void;
  readonly canGoBack: boolean;
}

export const OVERLAY_HANDLE = new InjectionToken<OverlayHandle>('OVERLAY_HANDLE');

const EXIT_MS = 150;

/**
 * One service for all modal UI (OV-01), on top of CDK Dialog. It keeps a stack: `open` replaces
 * it, `push` stacks on top, and closing the top overlay returns to the one underneath.
 */
@Injectable({ providedIn: 'root' })
export class OverlayService {
  private readonly dialog = inject(Dialog);
  private readonly stack = signal<OverlayEntry[]>([]);
  readonly depth = computed(() => this.stack().length);

  open<T>(component: Type<T>, props: Partial<Record<keyof T, unknown>> = {}, options: OverlayOptions = {}): void {
    this.closeAll(true);
    this.push(component, props, options);
  }

  push<T>(component: Type<T>, props: Partial<Record<keyof T, unknown>> = {}, options: OverlayOptions = {}): void {
    const entry: OverlayEntry = {
      component: component as Type<unknown>,
      props: props as Record<string, unknown>,
      options,
      closing: signal(false)
    };
    const ref = this.dialog.open<unknown, OverlayEntry, OverlayShell>(OverlayShell, {
      data: entry,
      disableClose: true,
      hasBackdrop: true,
      backdropClass: ['bg-black/50', 'transition-opacity'],
      panelClass: options.size === 'full' ? ['w-full', 'h-full'] : ['w-full', 'max-w-[calc(100vw-2rem)]', 'justify-center'],
      autoFocus: 'first-tabbable',
      restoreFocus: true
    });
    entry.ref = ref;
    ref.backdropClick.subscribe(() => this.closeEntry(entry));
    ref.keydownEvents.subscribe((event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        this.closeEntry(entry);
      }
    });
    ref.closed.subscribe(() => {
      this.stack.update((s) => s.filter((e) => e !== entry));
      entry.options.onClose?.();
    });
    this.stack.update((s) => [...s, entry]);
  }

  /** Closes the top overlay. */
  close(): void {
    const top = this.stack().at(-1);
    if (top) {
      this.closeEntry(top);
    }
  }

  closeAll(immediate = false): void {
    for (const entry of [...this.stack()].reverse()) {
      if (immediate) {
        entry.ref?.close();
      } else {
        this.closeEntry(entry);
      }
    }
  }

  /** @internal */
  isStacked(entry: OverlayEntry): boolean {
    return this.stack().indexOf(entry) > 0;
  }

  /** @internal */
  closeEntry(entry: OverlayEntry): void {
    if (entry.closing()) {
      return;
    }
    // Play the exit animation with the last content still rendered, then close.
    entry.closing.set(true);
    setTimeout(() => entry.ref?.close(), EXIT_MS);
  }
}

@Component({
  selector: 'ngf-overlay-shell',
  imports: [NgComponentOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: OVERLAY_HANDLE,
      useFactory: (): OverlayHandle => {
        const service = inject(OverlayService);
        const entry = inject<OverlayEntry>(DIALOG_DATA);
        return {
          close: () => service.closeEntry(entry),
          back: () => service.closeEntry(entry),
          get canGoBack() {
            return service.isStacked(entry);
          }
        };
      }
    }
  ],
  host: {
    '[class]': 'classes()'
  },
  template: `<ng-container *ngComponentOutlet="entry.component; inputs: entry.props" />`
})
export class OverlayShell {
  protected readonly entry = inject<OverlayEntry>(DIALOG_DATA);
  protected readonly classes = computed(() => {
    const size = this.entry.options.size ?? 'md';
    const base =
      'flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden border bg-background text-foreground shadow-lg transition-[opacity,scale,translate] duration-150';
    const sizes = {
      sm: 'mx-auto max-w-sm rounded-lg',
      md: 'mx-auto max-w-lg rounded-lg',
      lg: 'mx-auto max-w-2xl rounded-lg',
      full: 'h-dvh max-h-dvh rounded-none'
    };
    const state = this.entry.closing() ? 'opacity-0 scale-95' : 'opacity-100 scale-100 starting:opacity-0 starting:scale-95';
    return `${base} ${sizes[size]} ${state}`;
  });
}

/** Standard overlay layout: header (back, title, close), scrollable body, footer actions. */
@Component({
  selector: 'ngf-overlay',
  imports: [LucideAngularModule, Button, Spinner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <header class="flex items-start gap-2 border-b px-5 py-4">
      @if (handle.canGoBack) {
        <button ngfButton variant="ghost" size="icon-sm" class="-ml-2" aria-label="Back" title="Back" (click)="handle.back()">
          <lucide-icon [img]="BackIcon" [size]="16" />
        </button>
      }
      <div class="flex min-w-0 flex-1 flex-col gap-1">
        <h2 class="text-base leading-tight font-semibold">{{ title() }}</h2>
        @if (description()) {
          <p class="text-sm text-muted-foreground">{{ description() }}</p>
        }
      </div>
      <button ngfButton variant="ghost" size="icon-sm" class="-mr-2" aria-label="Close" title="Close" (click)="handle.close()">
        <lucide-icon [img]="CloseIcon" [size]="16" />
      </button>
    </header>
    <div class="min-h-0 flex-1 overflow-y-auto" [class.px-5]="padded()" [class.py-4]="padded()">
      <ng-content />
    </div>
    @if (actions().length) {
      <footer class="flex flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end">
        @for (action of actions(); track action.label) {
          <button
            ngfButton
            [variant]="action.variant ?? 'default'"
            [disabled]="action.disabled || action.loading"
            (click)="action.onClick()"
          >
            @if (action.loading) {
              <ngf-spinner />
            }
            {{ action.label }}
          </button>
        }
      </footer>
    }
  `
})
export class OverlayLayout {
  readonly title = input.required<string>();
  readonly description = input<string>('');
  readonly actions = input<OverlayAction[]>([]);
  readonly padded = input(true);

  protected readonly handle = inject(OVERLAY_HANDLE);
  protected readonly BackIcon = ArrowLeft;
  protected readonly CloseIcon = X;
}

/** Confirm overlay (OV-02). Every delete or clear in the app goes through it. */
@Component({
  selector: 'ngf-confirm-overlay',
  imports: [OverlayLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngf-overlay [title]="title()" [actions]="actions()">
      <p class="text-sm text-muted-foreground">{{ message() }}</p>
    </ngf-overlay>
  `
})
export class ConfirmOverlay {
  readonly title = input.required<string>();
  readonly message = input.required<string>();
  readonly confirmLabel = input('Confirm');
  readonly confirmVariant = input<'default' | 'destructive'>('default');
  readonly onConfirm = input.required<() => unknown>();

  private readonly handle = inject(OVERLAY_HANDLE);
  protected readonly actions = computed<OverlayAction[]>(() => [
    { label: 'Cancel', variant: 'outline', onClick: () => this.handle.close() },
    {
      label: this.confirmLabel(),
      variant: this.confirmVariant(),
      onClick: () => {
        this.onConfirm()();
        this.handle.close();
      }
    }
  ]);
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'default' | 'destructive';
  onConfirm: () => unknown;
}

/** Opens a confirm overlay, stacking it on top when another overlay is already open. */
export function confirm(overlays: OverlayService, options: ConfirmOptions): void {
  const props = { confirmLabel: 'Delete', confirmVariant: 'destructive' as const, ...options };
  if (overlays.depth() > 0) {
    overlays.push(ConfirmOverlay, props, { size: 'sm' });
  } else {
    overlays.open(ConfirmOverlay, props, { size: 'sm' });
  }
}

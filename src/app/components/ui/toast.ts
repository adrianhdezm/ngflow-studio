import { ChangeDetectionStrategy, Component, Injectable, inject, signal } from '@angular/core';
import { CircleAlert, CircleCheck, Info, LucideAngularModule, X } from 'lucide-angular';

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  variant: ToastVariant;
  message: string;
}

/** In-house toasts (TOAST-01). */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private nextId = 0;

  show(variant: ToastVariant, message: string, duration = 4000): number {
    const id = ++this.nextId;
    this.toasts.update((list) => [...list.slice(-4), { id, variant, message }]);
    setTimeout(() => this.dismiss(id), duration);
    return id;
  }

  success(message: string): number {
    return this.show('success', message);
  }

  error(message: string): number {
    return this.show('error', message, 6000);
  }

  info(message: string): number {
    return this.show('info', message);
  }

  dismiss(id: number): void {
    this.toasts.update((list) => list.filter((t) => t.id !== id));
  }
}

@Component({
  selector: 'ngf-toaster',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'pointer-events-none fixed right-4 bottom-4 z-[2000] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2' },
  template: `
    <div class="sr-only" role="status" aria-live="polite">{{ service.toasts().at(-1)?.message }}</div>
    @for (toast of service.toasts(); track toast.id) {
      <div
        class="pointer-events-auto flex items-start gap-3 rounded-md border bg-popover p-3 text-sm text-popover-foreground shadow-lg transition-all duration-200 starting:translate-y-2 starting:opacity-0"
        [attr.data-variant]="toast.variant"
      >
        @switch (toast.variant) {
          @case ('success') {
            <lucide-icon [img]="SuccessIcon" [size]="16" class="mt-0.5 shrink-0 text-green-600" />
          }
          @case ('error') {
            <lucide-icon [img]="ErrorIcon" [size]="16" class="mt-0.5 shrink-0 text-red-600" />
          }
          @default {
            <lucide-icon [img]="InfoIcon" [size]="16" class="mt-0.5 shrink-0 text-blue-600" />
          }
        }
        <p class="flex-1 leading-snug">{{ toast.message }}</p>
        <button
          type="button"
          class="cursor-pointer text-muted-foreground hover:text-foreground"
          aria-label="Dismiss"
          (click)="service.dismiss(toast.id)"
        >
          <lucide-icon [img]="CloseIcon" [size]="14" />
        </button>
      </div>
    }
  `
})
export class Toaster {
  protected readonly service = inject(ToastService);
  protected readonly SuccessIcon = CircleCheck;
  protected readonly ErrorIcon = CircleAlert;
  protected readonly InfoIcon = Info;
  protected readonly CloseIcon = X;
}

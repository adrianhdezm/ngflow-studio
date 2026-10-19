import { OverlayRef, createFlexibleConnectedPositionStrategy, createOverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import { ChangeDetectionStrategy, Component, DestroyRef, Directive, ElementRef, Injector, inject, input } from '@angular/core';

@Component({
  selector: 'ngf-tooltip-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    role: 'tooltip',
    class:
      'pointer-events-none max-w-64 rounded-md bg-primary px-2.5 py-1.5 text-xs text-primary-foreground shadow-sm transition-opacity duration-100 starting:opacity-0'
  },
  template: '{{ text() }}'
})
export class TooltipPanel {
  readonly text = input('');
}

/** `<button ngfTooltip="Zoom in">`: shows a small label on hover and keyboard focus. */
@Directive({
  selector: '[ngfTooltip]',
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
    '(pointerdown)': 'hide()'
  }
})
export class Tooltip {
  readonly text = input('', { alias: 'ngfTooltip' });
  readonly position = input<'top' | 'bottom' | 'left' | 'right'>('top');

  private readonly injector = inject(Injector);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private overlayRef: OverlayRef | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.timer);
      this.overlayRef?.dispose();
    });
  }

  protected show(): void {
    if (!this.text()) {
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.attach(), 400);
  }

  protected hide(): void {
    clearTimeout(this.timer);
    this.overlayRef?.detach();
  }

  private attach(): void {
    const pos = this.position();
    const positions =
      pos === 'top'
        ? [{ originX: 'center', originY: 'top', overlayX: 'center', overlayY: 'bottom', offsetY: -6 } as const]
        : pos === 'bottom'
          ? [{ originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 } as const]
          : pos === 'left'
            ? [{ originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -6 } as const]
            : [{ originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 6 } as const];
    if (!this.overlayRef) {
      this.overlayRef = createOverlayRef(this.injector, {
        positionStrategy: createFlexibleConnectedPositionStrategy(this.injector, this.host)
          .withPositions([...positions, { originX: 'center', originY: 'bottom', overlayX: 'center', overlayY: 'top', offsetY: 6 }])
          .withPush(true)
      });
    }
    if (!this.overlayRef.hasAttached()) {
      const ref = this.overlayRef.attach(new ComponentPortal(TooltipPanel, null, this.injector));
      ref.setInput('text', this.text());
    }
  }
}

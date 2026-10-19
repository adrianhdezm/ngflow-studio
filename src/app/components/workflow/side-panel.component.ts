import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ChevronLeft, ChevronRight, LucideAngularModule } from 'lucide-angular';
import { PANEL_MAX, PANEL_MIN, UiStateService } from '../../services/ui-state.service';
import { PropertiesPanel } from './panel/properties-panel.component';

/** Desktop right panel: resizable (SHELL-07) and collapsible (SHELL-08). */
@Component({
  selector: 'ngf-side-panel',
  imports: [LucideAngularModule, PropertiesPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'contents' },
  template: `
    <aside
      class="fixed top-0 right-0 bottom-0 z-30 border-l bg-background ease-out"
      [class.transition-transform]="!resizing()"
      [class.duration-300]="!resizing()"
      [style.width.vw]="ui.panelWidth()"
      [style.transform]="hidden() ? 'translateX(100%)' : 'translateX(0)'"
      [attr.aria-hidden]="hidden()"
      [attr.inert]="hidden() ? '' : null"
      aria-label="Properties panel"
    >
      <div
        class="group absolute top-0 bottom-0 -left-1.5 z-10 flex w-3 cursor-col-resize justify-center outline-none"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize panel"
        [attr.aria-valuenow]="round(ui.panelWidth())"
        [attr.aria-valuemin]="min"
        [attr.aria-valuemax]="max"
        tabindex="0"
        (pointerdown)="startResize($event)"
        (keydown)="onKeydown($event)"
      >
        <div
          class="h-full w-1 bg-transparent transition-colors group-hover:bg-blue-500 group-focus-visible:bg-blue-500"
          [class.bg-blue-500]="resizing()"
        ></div>
        @if (!resizing()) {
          <button
            type="button"
            class="absolute top-1/2 left-1/2 flex size-6 -translate-1/2 cursor-pointer items-center justify-center rounded-full border bg-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
            title="Collapse panel"
            aria-label="Collapse panel"
            (pointerdown)="$event.stopPropagation()"
            (click)="ui.panelCollapsed.set(true)"
          >
            <lucide-icon [img]="CollapseIcon" [size]="14" />
          </button>
        }
      </div>
      <ngf-properties-panel />
    </aside>

    @if (visible() && ui.panelCollapsed()) {
      <button
        type="button"
        class="fixed top-1/2 right-0 z-30 flex h-12 w-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-l-md border border-r-0 bg-background shadow-sm hover:bg-accent"
        title="Expand panel"
        aria-label="Expand panel"
        (click)="ui.panelCollapsed.set(false)"
      >
        <lucide-icon [img]="ExpandIcon" [size]="14" />
      </button>
    }
  `
})
export class SidePanel {
  /** False on "/" and while loading; the panel then stays off-screen. */
  readonly visible = input(true);

  protected readonly ui = inject(UiStateService);
  protected readonly resizing = signal(false);
  protected readonly hidden = computed(() => !this.visible() || this.ui.panelCollapsed());
  protected readonly min = PANEL_MIN;
  protected readonly max = PANEL_MAX;

  protected round(n: number): number {
    return Math.round(n);
  }

  protected startResize(event: PointerEvent): void {
    event.preventDefault();
    const el = event.currentTarget as HTMLElement;
    el.setPointerCapture(event.pointerId);
    this.resizing.set(true);
    const move = (e: PointerEvent) => this.ui.setPanelWidth(((window.innerWidth - e.clientX) / window.innerWidth) * 100);
    const up = () => {
      this.resizing.set(false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      this.ui.setPanelWidth(this.ui.panelWidth() + (event.key === 'ArrowLeft' ? 1 : -1));
    }
  }

  protected readonly CollapseIcon = ChevronRight;
  protected readonly ExpandIcon = ChevronLeft;
}

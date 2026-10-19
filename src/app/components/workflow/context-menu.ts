import { CdkMenu, CdkMenuItem } from '@angular/cdk/menu';
import {
  OverlayRef,
  createFlexibleConnectedPositionStrategy,
  createOverlayRef,
  createRepositionScrollStrategy
} from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ChangeDetectionStrategy,
  Component,
  Injectable,
  Injector,
  afterNextRender,
  inject,
  input,
  output,
  ElementRef
} from '@angular/core';
import { LucideAngularModule, LucideIconData } from 'lucide-angular';

export interface ContextMenuItem {
  label: string;
  icon: LucideIconData;
  disabled?: boolean;
  destructive?: boolean;
  action: () => void;
}

@Component({
  selector: 'ngf-context-menu-panel',
  imports: [CdkMenu, CdkMenuItem, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      cdkMenu
      class="flex min-w-44 flex-col rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none transition-[opacity,scale] duration-100 starting:scale-95 starting:opacity-0"
      role="menu"
    >
      @for (item of items(); track item.label) {
        <button
          cdkMenuItem
          type="button"
          [cdkMenuItemDisabled]="!!item.disabled"
          class="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none hover:bg-accent focus:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-50"
          [class.text-destructive]="item.destructive"
          (cdkMenuItemTriggered)="selected.emit(item)"
        >
          <lucide-icon [img]="item.icon" [size]="16" />
          <span class="truncate">{{ item.label }}</span>
        </button>
      }
    </div>
  `
})
export class ContextMenuPanel {
  readonly items = input<ContextMenuItem[]>([]);
  readonly selected = output<ContextMenuItem>();

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef);
    afterNextRender(() => host.nativeElement.querySelector<HTMLElement>('[cdkMenuItem]:not([aria-disabled="true"])')?.focus());
  }
}

/** Floating menu at the cursor (CNV-21). Closes on outside click, Escape, or after an action. */
@Injectable({ providedIn: 'root' })
export class ContextMenuService {
  private readonly injector = inject(Injector);
  private overlayRef: OverlayRef | null = null;

  open(point: { x: number; y: number }, items: ContextMenuItem[]): void {
    this.close();
    const overlayRef = createOverlayRef(this.injector, {
      positionStrategy: createFlexibleConnectedPositionStrategy(this.injector, point)
        .withPositions([
          { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'top' },
          { originX: 'start', originY: 'top', overlayX: 'end', overlayY: 'top' },
          { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom' }
        ])
        .withPush(true),
      scrollStrategy: createRepositionScrollStrategy(this.injector)
    });
    const ref = overlayRef.attach(new ComponentPortal(ContextMenuPanel, null, this.injector));
    ref.setInput('items', items);
    ref.instance.selected.subscribe((item) => {
      this.close();
      item.action();
    });
    overlayRef.outsidePointerEvents().subscribe((event) => {
      if (event.type !== 'auxclick') {
        this.close();
      }
    });
    overlayRef.keydownEvents().subscribe((event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        this.close();
      }
    });
    this.overlayRef = overlayRef;
  }

  close(): void {
    this.overlayRef?.dispose();
    this.overlayRef = null;
  }
}

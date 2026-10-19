import { CdkMenu, CdkMenuGroup, CdkMenuItem, CdkMenuItemCheckbox, CdkMenuItemRadio, CdkMenuTrigger } from '@angular/cdk/menu';
import { Directive } from '@angular/core';

const ITEM =
  'relative flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm outline-none select-none hover:bg-accent focus:bg-accent aria-disabled:pointer-events-none aria-disabled:opacity-50 [&_lucide-icon]:text-muted-foreground';

/** Menu panel styling on top of CDK Menu: `<div ngfMenu>` inside an `<ng-template>`. */
@Directive({
  selector: '[ngfMenu]',
  hostDirectives: [CdkMenu],
  host: {
    class:
      'z-50 flex min-w-40 flex-col overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md outline-none transition-[opacity,scale] duration-100 starting:scale-95 starting:opacity-0'
  }
})
export class DropdownMenu {}

/** `<button ngfMenuItem (cdkMenuItemTriggered)="...">` */
@Directive({
  selector: '[ngfMenuItem]',
  hostDirectives: [{ directive: CdkMenuItem, inputs: ['cdkMenuItemDisabled'], outputs: ['cdkMenuItemTriggered'] }],
  host: { class: ITEM }
})
export class DropdownMenuItem {}

/** A menu item that opens a submenu: `<button ngfSubmenuTrigger [cdkMenuTriggerFor]="sub">`. */
@Directive({
  selector: '[ngfSubmenuTrigger]',
  hostDirectives: [{ directive: CdkMenuItem }, { directive: CdkMenuTrigger, inputs: ['cdkMenuTriggerFor', 'cdkMenuPosition'] }],
  host: { class: ITEM }
})
export class DropdownSubmenuTrigger {}

/** `<button ngfMenuItemRadio [cdkMenuItemChecked]="...">` */
@Directive({
  selector: '[ngfMenuItemRadio]',
  hostDirectives: [
    { directive: CdkMenuItemRadio, inputs: ['cdkMenuItemChecked', 'cdkMenuItemDisabled'], outputs: ['cdkMenuItemTriggered'] }
  ],
  host: { class: ITEM }
})
export class DropdownMenuItemRadio {}

@Directive({
  selector: '[ngfMenuItemCheckbox]',
  hostDirectives: [
    { directive: CdkMenuItemCheckbox, inputs: ['cdkMenuItemChecked', 'cdkMenuItemDisabled'], outputs: ['cdkMenuItemTriggered'] }
  ],
  host: { class: ITEM }
})
export class DropdownMenuItemCheckbox {}

@Directive({ selector: '[ngfMenuGroup]', hostDirectives: [CdkMenuGroup] })
export class DropdownMenuGroup {}

@Directive({ selector: '[ngfMenuSeparator]', host: { role: 'separator', class: '-mx-1 my-1 h-px bg-border' } })
export class DropdownMenuSeparator {}

@Directive({ selector: '[ngfMenuLabel]', host: { class: 'px-2 py-1.5 text-xs font-medium text-muted-foreground' } })
export class DropdownMenuLabel {}

export const DROPDOWN_MENU_IMPORTS = [
  CdkMenuTrigger,
  DropdownMenu,
  DropdownMenuItem,
  DropdownSubmenuTrigger,
  DropdownMenuItemRadio,
  DropdownMenuItemCheckbox,
  DropdownMenuGroup,
  DropdownMenuSeparator,
  DropdownMenuLabel
] as const;

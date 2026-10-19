import { Directive, computed, input } from '@angular/core';
import { cn } from '../../lib/cn';

export type ButtonVariant = 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link';
export type ButtonSize = 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm';

const VARIANTS: Record<ButtonVariant, string> = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90',
  destructive: 'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/40',
  outline: 'border bg-background hover:bg-accent hover:text-accent-foreground',
  secondary: 'border bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost: 'hover:bg-accent hover:text-accent-foreground',
  link: 'text-primary underline-offset-4 hover:underline'
};

const SIZES: Record<ButtonSize, string> = {
  default: 'h-9 px-4 py-2 has-[>lucide-icon]:px-3',
  sm: 'h-8 gap-1.5 px-3 text-xs',
  lg: 'h-10 px-6',
  icon: 'size-9',
  'icon-sm': 'size-8'
};

export function buttonClasses(variant: ButtonVariant = 'default', size: ButtonSize = 'default'): string {
  return cn(
    'relative inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors outline-none',
    'focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    VARIANTS[variant],
    SIZES[size]
  );
}

/** `<button ngfButton variant="outline" size="sm">` */
@Directive({
  selector: 'button[ngfButton], a[ngfButton]',
  host: { '[class]': 'classes()' }
})
export class Button {
  readonly variant = input<ButtonVariant>('default');
  readonly size = input<ButtonSize>('default');
  protected readonly classes = computed(() => buttonClasses(this.variant(), this.size()));
}

/** Joined button group: adjacent buttons share borders. */
@Directive({
  selector: '[ngfButtonGroup]',
  host: {
    role: 'group',
    class:
      'flex [&>*]:rounded-none [&>*:first-child]:rounded-l-md [&>*:last-child]:rounded-r-md [&>*:not(:first-child)]:-ml-px data-[orientation=vertical]:flex-col data-[orientation=vertical]:[&>*:first-child]:rounded-l-none data-[orientation=vertical]:[&>*:first-child]:rounded-t-md'
  }
})
export class ButtonGroup {}

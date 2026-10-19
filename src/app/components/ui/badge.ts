import { Directive, computed, input } from '@angular/core';
import { cn } from '../../lib/cn';

export type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

const VARIANTS: Record<BadgeVariant, string> = {
  default: 'border-transparent bg-primary text-primary-foreground',
  secondary: 'border-transparent bg-secondary text-secondary-foreground',
  outline: 'text-foreground',
  destructive: 'border-transparent bg-destructive text-white'
};

/** `<span ngfBadge variant="secondary">` */
@Directive({ selector: '[ngfBadge]', host: { '[class]': 'classes()' } })
export class Badge {
  readonly variant = input<BadgeVariant>('default');
  protected readonly classes = computed(() =>
    cn(
      'inline-flex w-fit shrink-0 items-center justify-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
      VARIANTS[this.variant()]
    )
  );
}

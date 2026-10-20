import { Directive } from '@angular/core';

@Directive({ selector: '[ngfCard]', host: { class: 'flex flex-col gap-4 rounded-md border bg-card py-5 text-card-foreground' } })
export class Card {}

@Directive({ selector: '[ngfCardHeader]', host: { class: 'flex flex-col gap-1.5 px-5' } })
export class CardHeader {}

@Directive({ selector: '[ngfCardTitle]', host: { class: 'leading-none font-semibold' } })
export class CardTitle {}

@Directive({ selector: '[ngfCardDescription]', host: { class: 'text-sm text-muted-foreground' } })
export class CardDescription {}

@Directive({ selector: '[ngfCardContent]', host: { class: 'px-5' } })
export class CardContent {}

@Directive({ selector: '[ngfCardFooter]', host: { class: 'flex items-center gap-2 px-5' } })
export class CardFooter {}

export const CARD_IMPORTS = [Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter] as const;

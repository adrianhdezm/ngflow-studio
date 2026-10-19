import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Button } from '../ui/button';
import { CARD_IMPORTS } from '../ui/card';

/** Shown over the canvas when a workflow doesn't exist (SHELL-05). */
@Component({
  selector: 'ngf-not-found',
  imports: [RouterLink, Button, ...CARD_IMPORTS],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'absolute inset-0 z-20 flex items-center justify-center p-4' },
  template: `
    <div ngfCard class="w-full max-w-sm text-center shadow-sm">
      <div ngfCardHeader>
        <h1 ngfCardTitle>Workflow Not Found</h1>
        <p ngfCardDescription>The workflow you're looking for doesn't exist or has been deleted.</p>
      </div>
      <div ngfCardFooter class="justify-center">
        <a ngfButton routerLink="/">New Workflow</a>
      </div>
    </div>
  `
})
export class NotFound {}

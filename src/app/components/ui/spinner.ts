import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { LoaderCircle, LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'ngf-spinner',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex', role: 'status', '[attr.aria-label]': 'label()' },
  template: `<lucide-icon [img]="icon" [size]="size()" class="animate-spin" />`
})
export class Spinner {
  readonly size = input(16);
  readonly label = input('Loading');
  protected readonly icon = LoaderCircle;
}

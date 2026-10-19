import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { OverlayLayout } from '../../ui/dialog';

@Component({
  selector: 'ngf-image-preview-overlay',
  imports: [OverlayLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngf-overlay [title]="title()">
      <img [src]="src()" alt="Step output" class="mx-auto max-h-[70vh] rounded-md border" />
    </ngf-overlay>
  `
})
export class ImagePreviewOverlay {
  readonly src = input.required<string>();
  readonly title = input('Output');
}

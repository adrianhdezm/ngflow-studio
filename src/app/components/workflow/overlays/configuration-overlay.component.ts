import { ChangeDetectionStrategy, Component, computed, viewChild } from '@angular/core';
import { OverlayLayout } from '../../ui/dialog';
import { PropertiesPanel } from '../panel/properties-panel.component';

/** Mobile Configuration overlay (SHELL-11): the panel content in a full-screen sheet. */
@Component({
  selector: 'ngf-configuration-overlay',
  imports: [OverlayLayout, PropertiesPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex min-h-0 flex-1 flex-col' },
  template: `
    <ngf-overlay [title]="title()" [padded]="false">
      <ngf-properties-panel class="min-h-full" [hideHeader]="true" />
    </ngf-overlay>
  `
})
export class ConfigurationOverlay {
  private readonly panel = viewChild(PropertiesPanel);
  protected readonly title = computed(() => this.panel()?.title() ?? 'Properties');
}

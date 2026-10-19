import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { INTEGRATIONS, getIntegration } from '../../../actions/registry';
import { ConnectionsStore } from '../../../services/connections.store';
import { Button } from '../../ui/button';
import { OverlayLayout, OverlayService } from '../../ui/dialog';
import { iconForKey } from '../icons';
import { AddConnectionOverlay } from './add-connection-overlay.component';

/** Connections overlay from the user menu (TB-12). */
@Component({
  selector: 'ngf-connections-overlay',
  imports: [LucideAngularModule, Button, OverlayLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngf-overlay title="Connections" description="Credentials used by steps that talk to other services.">
      <div class="flex flex-col gap-4">
        @for (integration of integrations; track integration.type) {
          <section class="flex flex-col gap-2">
            <div class="flex items-center gap-2">
              <lucide-icon [img]="icon(integration.icon).icon" [size]="16" [class]="icon(integration.icon).color" />
              <h3 class="flex-1 text-sm font-medium">{{ integration.label }}</h3>
              <button ngfButton variant="outline" size="sm" type="button" (click)="add(integration.type)">
                <lucide-icon [img]="PlusIcon" [size]="14" />
                Add
              </button>
            </div>
            @for (connection of store.ofType(integration.type); track connection.id) {
              <div class="rounded-md border px-3 py-2 text-sm">{{ connection.name }}</div>
            } @empty {
              <p class="text-xs text-muted-foreground">No {{ label(integration.type) }} connections yet.</p>
            }
          </section>
        }
      </div>
    </ngf-overlay>
  `
})
export class ConnectionsOverlay {
  protected readonly store = inject(ConnectionsStore);
  private readonly overlays = inject(OverlayService);
  protected readonly integrations = INTEGRATIONS;

  protected icon(key: string) {
    return iconForKey(key);
  }

  protected label(type: string): string {
    return getIntegration(type)?.label ?? type;
  }

  protected add(type: string): void {
    this.overlays.push(AddConnectionOverlay, { integrationType: type }, { size: 'sm' });
  }

  protected readonly PlusIcon = Plus;
}

/** Placeholder for user-menu items that need auth (TB-12). */
@Component({
  selector: 'ngf-stub-overlay',
  imports: [OverlayLayout],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngf-overlay [title]="title()">
      <p class="text-sm text-muted-foreground">{{ message() }}</p>
    </ngf-overlay>
  `
})
export class StubOverlay {
  readonly title = input('Settings');
  readonly message = input('Available once accounts are connected to a backend.');
}

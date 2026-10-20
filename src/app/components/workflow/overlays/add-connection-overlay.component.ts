import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { getIntegration } from '../../../actions/registry';
import { ConnectionsStore } from '../../../services/connections.store';
import { OVERLAY_HANDLE, OverlayAction, OverlayLayout } from '../../ui/dialog';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { ToastService } from '../../ui/toast';

/** Add-connection form for one integration type (PP-17). Credentials stay in the mock. */
@Component({
  selector: 'ngf-add-connection-overlay',
  imports: [OverlayLayout, Input, Label],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ngf-overlay
      [title]="'Add ' + label() + ' Connection'"
      description="Credentials are stored by the mock service only."
      [actions]="actions()"
    >
      <form class="flex flex-col gap-4" (submit)="$event.preventDefault(); save()">
        <div class="flex flex-col gap-2">
          <label ngfLabel for="connection-name">Name</label>
          <input ngfInput id="connection-name" [value]="name()" (input)="name.set($any($event.target).value)" />
        </div>
        @for (field of integration()?.credentialFields ?? []; track field.key) {
          <div class="flex flex-col gap-2">
            <label ngfLabel [for]="'cred-' + field.key">{{ field.label }}</label>
            <input ngfInput type="password" autocomplete="off" [id]="'cred-' + field.key" [placeholder]="field.placeholder ?? ''" />
          </div>
        }
        <button type="submit" class="hidden"></button>
      </form>
    </ngf-overlay>
  `
})
export class AddConnectionOverlay {
  readonly integrationType = input.required<string>();
  readonly onCreated = input<(id: string) => void>(() => {});

  private readonly store = inject(ConnectionsStore);
  private readonly handle = inject(OVERLAY_HANDLE);
  private readonly toasts = inject(ToastService);

  protected readonly integration = computed(() => getIntegration(this.integrationType()));
  protected readonly label = computed(() => this.integration()?.label ?? this.integrationType());
  protected readonly name = signal('');
  private readonly saving = signal(false);

  protected readonly actions = computed<OverlayAction[]>(() => [
    { label: 'Cancel', variant: 'outline', onClick: () => this.handle.close() },
    { label: 'Save', loading: this.saving(), disabled: !this.name().trim(), onClick: () => this.save() }
  ]);

  protected async save(): Promise<void> {
    if (!this.name().trim() || this.saving()) {
      return;
    }
    this.saving.set(true);
    try {
      const connection = await this.store.create({ type: this.integrationType(), name: this.name().trim() });
      this.onCreated()(connection.id);
      this.toasts.success('Connection added');
      this.handle.close();
    } catch {
      this.toasts.error('Failed to add connection');
    } finally {
      this.saving.set(false);
    }
  }
}

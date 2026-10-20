import { Injectable, effect, signal } from '@angular/core';
import { readStorage, writeStorage } from '../lib/storage';
import { PanelTab } from '../machines/workflow-editor.machine';

export const PANEL_MIN = 20;
export const PANEL_MAX = 50;
export const PANEL_DEFAULT = 30;

/**
 * Layout and preference state kept out of the editor machine (ST-01a), persisted per ST-09.
 * The editor machine requests tab switches through emitted events.
 */
@Injectable({ providedIn: 'root' })
export class UiStateService {
  /** Panel width, in % of the viewport. */
  readonly panelWidth = signal(clampWidth(readStorage('sidebar-width', PANEL_DEFAULT)));
  readonly panelCollapsed = signal(readStorage('sidebar-collapsed', false));
  readonly activeTab = signal<PanelTab>('properties');
  readonly minimapVisible = signal(false);
  readonly actionViewMode = signal<'list' | 'grid'>(readStorage('workflow-action-grid-view-mode', 'list'));
  readonly hiddenGroups = signal<string[]>(readStorage('workflow-action-grid-hidden-groups', []));
  readonly configOverlayOpen = signal(false);

  constructor() {
    effect(() => writeStorage('sidebar-width', this.panelWidth()));
    effect(() => writeStorage('sidebar-collapsed', this.panelCollapsed()));
    effect(() => writeStorage('workflow-action-grid-view-mode', this.actionViewMode()));
    effect(() => writeStorage('workflow-action-grid-hidden-groups', this.hiddenGroups()));
  }

  setPanelWidth(percent: number): void {
    this.panelWidth.set(clampWidth(percent));
  }

  togglePanel(): void {
    this.panelCollapsed.update((c) => !c);
  }

  toggleGroup(group: string): void {
    this.hiddenGroups.update((groups) => (groups.includes(group) ? groups.filter((g) => g !== group) : [...groups, group]));
  }
}

function clampWidth(value: unknown): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : PANEL_DEFAULT;
  return Math.min(PANEL_MAX, Math.max(PANEL_MIN, n));
}

import { Injectable, signal } from '@angular/core';
import { FitViewOptions, GraphController, XYPosition } from '../graph';

/** Lets UI outside the canvas (toolbar, shortcuts, the editor service) reach the graph controller. */
@Injectable({ providedIn: 'root' })
export class CanvasService {
  readonly controller = signal<GraphController | null>(null);
  /** Fit requested before the canvas registered; applied once it does. */
  private pendingFit: FitViewOptions | null = null;

  register(controller: GraphController | null): void {
    this.controller.set(controller);
    if (controller && this.pendingFit) {
      const options = this.pendingFit;
      this.pendingFit = null;
      void controller.fitView(options);
    }
  }

  fitView(options: FitViewOptions): Promise<void> {
    const controller = this.controller();
    if (!controller) {
      this.pendingFit = options;
      return Promise.resolve();
    }
    return controller.fitView(options);
  }

  /** Center of the visible canvas, in flow coordinates. */
  visibleCenter(): XYPosition {
    const controller = this.controller();
    if (!controller) {
      return { x: 0, y: 0 };
    }
    const rect = controller.getVisibleRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }
}

// Public API of the in-house graph engine (GE-01). Nothing in this folder imports workflow code.

export * from './types';
export * from './geometry';
export * from './changes';
export * from './graph-utils';
export { GraphController } from './graph-controller';
export { GraphComponent, isTypingTarget } from './graph.component';
export { HandleComponent } from './handle.component';
export {
  NodeTemplateDirective,
  EdgeTemplateDirective,
  ConnectionLineTemplateDirective,
  NoDragDirective,
  type NodeTemplateContext,
  type EdgeTemplateContext,
  type ConnectionLineTemplateContext
} from './templates';
export { BackgroundComponent } from './addons/background.component';
export { ControlsComponent } from './addons/controls.component';
export { MinimapComponent } from './addons/minimap.component';
export { PanelComponent, type PanelPosition } from './addons/panel.component';

import { BackgroundComponent } from './addons/background.component';
import { ControlsComponent } from './addons/controls.component';
import { MinimapComponent } from './addons/minimap.component';
import { PanelComponent } from './addons/panel.component';
import { GraphComponent } from './graph.component';
import { HandleComponent } from './handle.component';
import { ConnectionLineTemplateDirective, EdgeTemplateDirective, NoDragDirective, NodeTemplateDirective } from './templates';

/** Everything a template needs to render a graph; add to a component's `imports`. */
export const NGF_GRAPH_IMPORTS = [
  GraphComponent,
  HandleComponent,
  NodeTemplateDirective,
  EdgeTemplateDirective,
  ConnectionLineTemplateDirective,
  NoDragDirective,
  BackgroundComponent,
  ControlsComponent,
  MinimapComponent,
  PanelComponent
] as const;

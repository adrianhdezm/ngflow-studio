import { Directive, TemplateRef, inject, input } from '@angular/core';
import { GraphEdge, GraphNode, HandlePosition } from './types';

export interface NodeTemplateContext<D = any> {
  $implicit: GraphNode<D>;
  node: GraphNode<D>;
  selected: boolean;
  dragging: boolean;
}

export interface EdgeTemplateContext {
  $implicit: GraphEdge;
  edge: GraphEdge;
  path: string;
  selected: boolean;
  labelX: number;
  labelY: number;
}

export interface ConnectionLineTemplateContext {
  path: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  fromPosition: HandlePosition;
}

/** `<ng-template ngfNodeTemplate="action" let-node let-selected="selected">` (GE-06). */
@Directive({ selector: 'ng-template[ngfNodeTemplate]' })
export class NodeTemplateDirective {
  readonly type = input.required<string>({ alias: 'ngfNodeTemplate' });
  readonly template = inject<TemplateRef<NodeTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(_dir: NodeTemplateDirective, ctx: unknown): ctx is NodeTemplateContext {
    return true;
  }
}

/** `<ng-template ngfEdgeTemplate="animated" let-edge let-path="path">`. Content must use `svg:` elements. */
@Directive({ selector: 'ng-template[ngfEdgeTemplate]' })
export class EdgeTemplateDirective {
  readonly type = input.required<string>({ alias: 'ngfEdgeTemplate' });
  readonly template = inject<TemplateRef<EdgeTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(_dir: EdgeTemplateDirective, ctx: unknown): ctx is EdgeTemplateContext {
    return true;
  }
}

/** Optional custom connection preview. Content must use `svg:` elements. */
@Directive({ selector: 'ng-template[ngfConnectionLineTemplate]' })
export class ConnectionLineTemplateDirective {
  readonly template = inject<TemplateRef<ConnectionLineTemplateContext>>(TemplateRef);

  static ngTemplateContextGuard(_dir: ConnectionLineTemplateDirective, ctx: unknown): ctx is ConnectionLineTemplateContext {
    return true;
  }
}

/** Marks an element inside a node that must not start a node drag. */
@Directive({ selector: '[ngfNoDrag]', host: { 'data-ngf-no-drag': '' } })
export class NoDragDirective {}

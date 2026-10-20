import { Component } from '@angular/core';
import { Routes } from '@angular/router';

/**
 * Both routes render nothing themselves: the editor lives outside the router outlet so the canvas
 * persists across navigation (SHELL-01) and follows the URL through WorkflowEditorService.
 */
@Component({ selector: 'ngf-route', template: '' })
export class RouteMarker {}

export const routes: Routes = [
  { path: '', component: RouteMarker },
  { path: 'workflows/:workflowId', component: RouteMarker },
  { path: '**', redirectTo: '' }
];

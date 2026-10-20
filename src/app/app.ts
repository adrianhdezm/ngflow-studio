import { Component, DestroyRef, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { Toaster } from './components/ui/toast';
import { WorkflowEditor } from './components/workflow/workflow-editor.component';
import { ThemeService } from './services/theme.service';
import { WorkflowEditorService } from './services/workflow-editor.service';

@Component({
  imports: [RouterOutlet, WorkflowEditor, Toaster],
  selector: 'app-root',
  template: `
    <ngf-workflow-editor />
    <ngf-toaster />
    <router-outlet />
  `
})
export class App {
  constructor() {
    inject(ThemeService);
    const editor = inject(WorkflowEditorService);
    const subscription = inject(Router)
      .events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe((e) => editor.syncRoute(e.urlAfterRedirects));
    inject(DestroyRef).onDestroy(() => subscription.unsubscribe());
  }
}

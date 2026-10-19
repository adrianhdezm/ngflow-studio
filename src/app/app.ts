import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  imports: [RouterOutlet],
  selector: 'app-root',
  template: `
    <main class="flex min-h-screen items-center justify-center bg-slate-950">
      <h1 class="text-5xl font-bold tracking-tight text-white">Hello, <span class="text-sky-400">World</span>!</h1>
    </main>

    <router-outlet />
  `
})
export class App {
  protected readonly title = signal('ngflow-studio');
}

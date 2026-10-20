import { BreakpointObserver } from '@angular/cdk/layout';
import { Injectable, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/** Mobile vs desktop layout (< md is mobile), via CDK Layout. */
@Injectable({ providedIn: 'root' })
export class LayoutService {
  private readonly breakpoints = inject(BreakpointObserver);
  readonly isMobile = toSignal(this.breakpoints.observe('(max-width: 767.98px)').pipe(map((r) => r.matches)), {
    initialValue: typeof window !== 'undefined' && window.matchMedia('(max-width: 767.98px)').matches
  });
  readonly isTouch = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
}

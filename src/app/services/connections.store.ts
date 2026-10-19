import { Injectable, inject, signal } from '@angular/core';
import { Connection } from '../models/workflow';
import { CONNECTION_SERVICE } from './workflow.service';

/** The user's connections, shared by the panel, the canvas warnings and validation. */
@Injectable({ providedIn: 'root' })
export class ConnectionsStore {
  private readonly service = inject(CONNECTION_SERVICE);
  readonly connections = signal<Connection[]>([]);
  readonly loaded = signal(false);

  constructor() {
    void this.reload();
  }

  async reload(): Promise<void> {
    try {
      this.connections.set(await this.service.list());
    } finally {
      this.loaded.set(true);
    }
  }

  async create(input: { type: string; name: string; credentials?: Record<string, string> }): Promise<Connection> {
    const connection = await this.service.create(input);
    await this.reload();
    return connection;
  }

  ofType(type: string | undefined): Connection[] {
    return this.connections().filter((c) => c.type === type);
  }
}

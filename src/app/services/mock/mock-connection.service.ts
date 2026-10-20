import { Connection } from '../../models/workflow';
import { createId } from '../../lib/id';
import { readStorage, writeStorage } from '../../lib/storage';
import type { ConnectionService } from '../workflow.service';
import { LATENCY, delay } from './delay';

const KEY = 'ngflow:connections';

const SEED: Connection[] = [
  { id: 'conn-slack', type: 'slack', name: 'Acme Workspace' },
  { id: 'conn-db', type: 'database', name: 'Production DB' }
];

/** Connections kept in localStorage. Seeded with a Slack and a Database connection; Resend has none. */
export class MockConnectionService implements ConnectionService {
  private read(): Connection[] {
    return readStorage<Connection[] | null>(KEY, null) ?? SEED;
  }

  async list(): Promise<Connection[]> {
    await delay(LATENCY);
    return this.read();
  }

  async create(input: { type: string; name: string }): Promise<Connection> {
    await delay(LATENCY);
    const connection: Connection = { id: createId(), type: input.type, name: input.name };
    writeStorage(KEY, [...this.read(), connection]);
    return connection;
  }

  async delete(id: string): Promise<void> {
    await delay(LATENCY);
    writeStorage(
      KEY,
      this.read().filter((c) => c.id !== id)
    );
  }
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Simulated network latency of the mocks. */
export const LATENCY = 120;

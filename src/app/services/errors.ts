export class NotFoundError extends Error {
  constructor(message = 'Not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export function isNotFound(error: unknown): boolean {
  return error instanceof NotFoundError || (error instanceof Error && error.name === 'NotFoundError');
}

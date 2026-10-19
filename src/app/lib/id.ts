const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-';

/** nanoid-style random id. */
export function createId(size = 21): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let id = '';
  for (const byte of bytes) {
    id += ALPHABET[byte & 63];
  }
  return id;
}

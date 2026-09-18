// Excludes 0/1/I/O/L — the same charset Empire uses, chosen so a spoken or
// handwritten room code is never ambiguous.
const CHARSET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function randomRoomCode(length = 5): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return out;
}

export function isValidRoomCode(code: string, length = 5): boolean {
  const re = new RegExp(`^[${CHARSET}]{${length}}$`);
  return re.test(code);
}

/** Reads a room code from ?room= first, then the last non-empty path segment. */
export function parseRoomCode(pathname: string, search: string, length = 5): string | null {
  const fromQuery = new URLSearchParams(search).get('room');
  if (fromQuery && isValidRoomCode(fromQuery.toUpperCase(), length)) return fromQuery.toUpperCase();
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1]?.toUpperCase();
  if (last && isValidRoomCode(last, length)) return last;
  return null;
}

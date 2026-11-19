export function createUniqueId(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

export function currentTimestamp(): number {
  return Date.now();
}

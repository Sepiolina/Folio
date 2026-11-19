export function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err);
  return (
    name === 'ChunkLoadError' ||
    /ChunkLoadError/i.test(msg) ||
    /Loading chunk .* failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /expected expression, got '<'/i.test(msg) ||
    /Unexpected token ['"]?</i.test(msg)
  );
}

export async function withChunkRetry<T>(
  loader: () => Promise<T>,
  retries = 1,
  delayMs = 250
): Promise<T> {
  try {
    return await loader();
  } catch (err) {
    if (retries > 0 && isChunkLoadError(err)) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return withChunkRetry(loader, retries - 1, delayMs);
    }
    throw err;
  }
}

export function parseJsonSafely<T = Record<string, unknown>>(
  rawText: string
): { ok: true; data: T } | { ok: false; error: string } {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return { ok: true, data: {} as T };
  }
  try {
    return { ok: true, data: JSON.parse(trimmed) as T };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Invalid JSON payload',
    };
  }
}

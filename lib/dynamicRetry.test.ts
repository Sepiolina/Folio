import test from 'node:test';
import assert from 'node:assert/strict';
import { isChunkLoadError, parseJsonSafely, withChunkRetry } from './dynamicRetry';

test('isChunkLoadError identifies ChunkLoadError and HTML fallback syntax errors', () => {
  const chunkErr = new Error('Loading chunk _app-pages-browser_components_settings_SettingsDialog_tsx failed.');
  chunkErr.name = 'ChunkLoadError';
  assert.equal(isChunkLoadError(chunkErr), true);
  assert.equal(isChunkLoadError(new SyntaxError("expected expression, got '<'")), true);
  assert.equal(isChunkLoadError(new SyntaxError("Unexpected token '<'")), true);
  assert.equal(isChunkLoadError(new Error('Network offline')), false);
});

test('withChunkRetry retries transient ChunkLoadError and succeeds on retry', async () => {
  let attempts = 0;
  const result = await withChunkRetry(
    async () => {
      attempts += 1;
      if (attempts === 1) {
        const err = new Error('Loading chunk foo failed');
        err.name = 'ChunkLoadError';
        throw err;
      }
      return 'loaded-module';
    },
    1,
    10
  );
  assert.equal(result, 'loaded-module');
  assert.equal(attempts, 2);
});

test('parseJsonSafely handles HTML error pages without throwing SyntaxError', () => {
  const htmlRes = parseJsonSafely('<!DOCTYPE html><html><body>502</body></html>');
  assert.equal(htmlRes.ok, false);

  const validRes = parseJsonSafely<{ title: string }>('{"title":"Folio"}');
  assert.equal(validRes.ok, true);
  if (validRes.ok) {
    assert.equal(validRes.data.title, 'Folio');
  }
});

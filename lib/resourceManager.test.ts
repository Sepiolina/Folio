import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceManager } from './resourceManager';

test('resourceManager tracks and deterministically cleans up scoped resources', async () => {
  let pdfDestroyed = false;
  let canvasReleased = false;
  const controller = new AbortController();

  resourceManager.registerFrame('frame-1', 'tab-test');
  resourceManager.registerPdfDoc('doc-1', 'tab-test', () => {
    pdfDestroyed = true;
  });
  resourceManager.registerCanvas('canvas-1', 'tab-test', 1000, 1200, () => {
    canvasReleased = true;
  });
  resourceManager.registerJob('job-1', 'tab-test', 'Export test', controller);

  const before = resourceManager.getSnapshot();
  assert.equal(before.activeFrames, 1);
  assert.equal(before.openPdfDocs, 1);
  assert.equal(before.renderedCanvases, 1);
  assert.equal(before.canvasEstimatedBytes, 1000 * 1200 * 4);
  assert.equal(before.runningExportJobs, 1);
  assert.equal(before.activeAbortControllers, 1);

  await resourceManager.cleanupScope('tab-test');

  const after = resourceManager.getSnapshot();
  assert.equal(pdfDestroyed, true);
  assert.equal(canvasReleased, true);
  assert.equal(controller.signal.aborted, true);
  assert.equal(after.activeFrames, 0);
  assert.equal(after.openPdfDocs, 0);
  assert.equal(after.renderedCanvases, 0);
  assert.equal(after.canvasEstimatedBytes, 0);
  assert.equal(after.runningExportJobs, 0);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRIMARY_WORKSPACE_TOOLS,
  PDF_SUB_TOOLS,
  MARKDOWN_SUB_TOOLS,
  buildMarkdownTemplateContent,
  parseBatchOperationFromUrl,
  buildBatchToolsUrl,
} from './toolsHelper';

test('PRIMARY_WORKSPACE_TOOLS exposes PDF Tools, Markdown, Sheet, Open File, and Apps', () => {
  assert.deepEqual(
    PRIMARY_WORKSPACE_TOOLS.map((t) => t.id),
    ['pdf-tools', 'markdown-tools', 'sheet', 'open-file', 'apps']
  );
  const groupIds = PRIMARY_WORKSPACE_TOOLS.filter((t) => t.isGroup).map((t) => t.id);
  assert.deepEqual(groupIds, ['pdf-tools', 'markdown-tools', 'apps']);
});

test('PDF_SUB_TOOLS groups all four PDF batch operations', () => {
  assert.deepEqual(
    PDF_SUB_TOOLS.map((t) => t.batchOp),
    ['merge', 'images', 'split', 'optimize']
  );
});

test('MARKDOWN_SUB_TOOLS provides note creation templates and open option', () => {
  assert.deepEqual(
    MARKDOWN_SUB_TOOLS.map((t) => t.id),
    ['md-new', 'md-meeting', 'md-doc', 'md-open']
  );
  const meeting = buildMarkdownTemplateContent('meeting', 'Weekly_Sync.md');
  assert.ok(meeting.includes('# Weekly_Sync'));
  assert.ok(meeting.includes('## Action Items'));
});

test('parseBatchOperationFromUrl parses valid batch operations and ignores invalid inputs', () => {
  assert.equal(parseBatchOperationFromUrl('folio://pdf-batch-tools?op=images'), 'images');
  assert.equal(parseBatchOperationFromUrl('folio://pdf-batch-tools?op=split'), 'split');
  assert.equal(parseBatchOperationFromUrl('folio://pdf-batch-tools?op=optimize'), 'optimize');
  assert.equal(parseBatchOperationFromUrl('folio://pdf-batch-tools?op=merge'), 'merge');
  assert.equal(parseBatchOperationFromUrl('folio://pdf-batch-tools?op=unknown'), null);
  assert.equal(parseBatchOperationFromUrl('folio://pdf-batch-tools'), null);
  assert.equal(parseBatchOperationFromUrl(undefined), null);
});

test('buildBatchToolsUrl builds clean internal Folio URLs', () => {
  assert.equal(buildBatchToolsUrl('images'), 'folio://pdf-batch-tools?op=images');
  assert.equal(buildBatchToolsUrl(), 'folio://pdf-batch-tools');
});

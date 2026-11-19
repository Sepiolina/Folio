import test from 'node:test';
import assert from 'node:assert/strict';
import type { TabItem } from '../types/workspace';
import {
  findTabsDueForSuspension,
  getNextSuspensionDelayMs,
  isTabEligibleForSuspension,
} from './tabLifecycle';

function makeTab(overrides: Partial<TabItem>): TabItem {
  return {
    id: 't1',
    type: 'browser',
    title: 'Example',
    url: 'https://example.com',
    browserHistory: ['https://example.com'],
    browserHistoryIndex: 0,
    zoom: 1,
    ...overrides,
  };
}

test('isTabEligibleForSuspension protects active, loading, dirty, home, and already-suspended tabs', () => {
  assert.equal(isTabEligibleForSuspension(makeTab({ id: 'active' }), 'active'), false);
  assert.equal(isTabEligibleForSuspension(makeTab({ id: 'loading', isLoading: true }), 'active'), false);
  assert.equal(isTabEligibleForSuspension(makeTab({ id: 'dirty', isDirty: true }), 'active'), false);
  assert.equal(isTabEligibleForSuspension(makeTab({ id: 'home', type: 'home' }), 'active'), false);
  assert.equal(
    isTabEligibleForSuspension(makeTab({ id: 'susp', lifecycleState: 'suspended' }), 'active'),
    false
  );
  assert.equal(isTabEligibleForSuspension(makeTab({ id: 'idle' }), 'active'), true);
  assert.equal(isTabEligibleForSuspension(makeTab({ id: 'md-clean', type: 'markdown' }), 'active'), true);
  assert.equal(
    isTabEligibleForSuspension(makeTab({ id: 'md-dirty', type: 'markdown', isDirty: true }), 'active'),
    false
  );
  assert.equal(isTabEligibleForSuspension(makeTab({ id: 'pdf-clean', type: 'pdf' }), 'active'), true);
});

test('findTabsDueForSuspension and getNextSuspensionDelayMs schedule accurately', () => {
  const now = 1_000_000;
  const timeoutMs = 60_000;
  const tabs: TabItem[] = [
    makeTab({ id: 'active', lastActiveAt: now - 500_000 }),
    makeTab({ id: 'due', lastActiveAt: now - 70_000 }),
    makeTab({ id: 'soon', lastActiveAt: now - 45_000 }),
  ];

  assert.deepEqual(findTabsDueForSuspension(tabs, 'active', timeoutMs, now), ['due']);
  assert.equal(getNextSuspensionDelayMs(tabs.filter((t) => t.id !== 'due'), 'active', timeoutMs, now), 15_000);
});

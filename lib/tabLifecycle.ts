import type { TabItem } from '../types/workspace';

export function isTabEligibleForSuspension(tab: TabItem, activeTabId: string): boolean {
  if (tab.id === activeTabId) return false;
  if (tab.type === 'home' || tab.type === 'settings') return false;
  if (tab.lifecycleState === 'suspended') return false;
  if (tab.isLoading || tab.isDirty) return false;
  return true;
}

export function findTabsDueForSuspension(
  tabs: TabItem[],
  activeTabId: string,
  timeoutMs: number,
  now: number
): string[] {
  if (timeoutMs <= 0) return [];
  const due: string[] = [];
  for (const tab of tabs) {
    if (!isTabEligibleForSuspension(tab, activeTabId)) continue;
    const lastActive = tab.lastActiveAt ?? now;
    if (now - lastActive >= timeoutMs) {
      due.push(tab.id);
    }
  }
  return due;
}

export function getNextSuspensionDelayMs(
  tabs: TabItem[],
  activeTabId: string,
  timeoutMs: number,
  now: number
): number | null {
  if (timeoutMs <= 0) return null;
  let minDelay: number | null = null;
  for (const tab of tabs) {
    if (!isTabEligibleForSuspension(tab, activeTabId)) continue;
    const lastActive = tab.lastActiveAt ?? now;
    const remaining = Math.max(0, timeoutMs - (now - lastActive));
    if (minDelay === null || remaining < minDelay) {
      minDelay = remaining;
    }
  }
  return minDelay;
}

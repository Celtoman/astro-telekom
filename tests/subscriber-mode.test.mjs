import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBSCRIBER_MODE_DURATION_MS,
  isSubscriberModeActive,
  subscriberModeExpiresAt,
} from '../apps/web/src/lib/subscriber-mode.mjs';

test('subscriber mode lasts exactly 30 days from activation', () => {
  const now = Date.UTC(2026, 8, 11, 12, 0, 0);
  assert.equal(subscriberModeExpiresAt(now), now + 30 * 24 * 60 * 60 * 1000);
  assert.equal(SUBSCRIBER_MODE_DURATION_MS, 30 * 24 * 60 * 60 * 1000);
});

test('subscriber mode accepts only an unexpired integer timestamp', () => {
  const now = 1_000_000;
  assert.equal(isSubscriberModeActive(String(now + 1), now), true);
  assert.equal(isSubscriberModeActive(String(now), now), false);
  assert.equal(isSubscriberModeActive(String(now - 1), now), false);
  assert.equal(isSubscriberModeActive('not-a-date', now), false);
  assert.equal(isSubscriberModeActive('1000000.5', now), false);
  assert.equal(isSubscriberModeActive(null, now), false);
});

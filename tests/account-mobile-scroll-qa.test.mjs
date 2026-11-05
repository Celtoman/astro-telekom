import test from 'node:test';
import assert from 'node:assert/strict';
import { assessVertical, fullyVisibleCards, gesturePoint, cardPanDistance } from '../scripts/qa/account-mobile-scroll.mjs';

test('a programmatic rail reset invalidates the protocol even when the page happens to move', () => {
  assert.equal(assessVertical({ beforeY: 100, afterY: 235, beforeX: 0, afterX: 0, direction: 1, programmaticWrites: 1, inputDelivered: true }).status, 'INVALID');
});
test('the observed #521 zero-delta trace cannot pass as a successful vertical gesture', () => {
  assert.equal(assessVertical({ beforeY: 6484, afterY: 6484, beforeX: 0, afterX: 0, direction: 1, programmaticWrites: 0, inputDelivered: true }).status, 'FAIL');
});
test('missing or non-finite observations are invalid evidence', () => {
  assert.equal(assessVertical({ beforeY: 100, afterY: NaN, beforeX: 0, afterX: 0, direction: 1, programmaticWrites: 0, inputDelivered: true }).status, 'INVALID');
  assert.equal(assessVertical({ beforeY: 100, afterY: 235, beforeX: 0, afterX: 0, direction: 1, inputDelivered: true }).status, 'INVALID');
});
test('movement without delivered input cannot be presented as a passed user gesture', () => {
  assert.equal(assessVertical({ beforeY: 100, afterY: 235, beforeX: 0, afterX: 0, direction: 1, programmaticWrites: 0, inputDelivered: false }).status, 'INVALID');
});
test('native vertical movement is accepted in both directions without horizontal page movement', () => {
  assert.equal(assessVertical({ beforeY: 6484, afterY: 6619, beforeX: 0, afterX: 0, direction: 1, programmaticWrites: 0, inputDelivered: true }).status, 'PASS');
  assert.equal(assessVertical({ beforeY: 6619, afterY: 6484, beforeX: 0, afterX: 0, direction: -1, programmaticWrites: 0, inputDelivered: true }).status, 'PASS');
  assert.equal(assessVertical({ beforeY: 100, afterY: 235, beforeX: 0, afterX: 20, direction: 1, programmaticWrites: 0, inputDelivered: true }).status, 'FAIL');
});
test('a peek of the next card does not count as reaching that card', () => {
  assert.deepEqual(fullyVisibleCards({ left: 16, right: 374 }, [{ index: 0, left: 16, right: 342 }, { index: 1, left: 358, right: 684 }]), [0]);
  assert.deepEqual(fullyVisibleCards({ left: 16, right: 374 }, [{ index: 0, left: -287, right: 39 }, { index: 1, left: 55, right: 381 }]), []);
  assert.deepEqual(fullyVisibleCards({ left: 16, right: 374 }, [{ index: 1, left: 39, right: 365 }]), [1]);
});
test('gesture starts stay inside the visible rail and viewport rather than blindly clamping outside it', () => {
  assert.deepEqual(gesturePoint({ left: 16, right: 374, top: 309, bottom: 591 }, { width: 390, height: 900 }), { x: 195, y: 450, left: 40, right: 350 });
  assert.throws(() => gesturePoint({ left: 16, right: 374, top: -300, bottom: -20 }, { width: 390, height: 900 }), /visible/);
});
test('a five-pixel correction on a full-width320 card must not oscillate in25-pixel jumps', () => {
  assert.equal(cardPanDistance(5, 200), 20);
  assert.equal(cardPanDistance(-5, 200), -20);
  assert.equal(cardPanDistance(264, 200), 200);
});

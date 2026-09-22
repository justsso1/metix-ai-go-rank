import assert from 'node:assert/strict';
import test from 'node:test';
import { DEBUG_SCENARIOS, debugResult, debugTimeline, validDebugSettings } from '../src/recruiters-view/motion-debug.ts';
import { advancePrelude, preludeSpeed, revealTiming } from '../src/recruiters-view/ranking-motion.ts';
import { leaderboardRows } from '../src/recruiters-view/leaderboard.ts';
const result = debugResult('47');

test('seekable debug clock matches production timing for early and late responses', () => {
  for (const at of [0, 1.88, 15, 20, 35]) {
    const prelude = Math.min(18, at), speed = preludeSpeed(prelude);
    const dockAt = at + (18 - prelude) / speed;
    for (const after of [0, .1, 1, 2]) {
      assert.ok(Math.abs(debugTimeline(at + after, at, result).prelude - advancePrelude(prelude, after, speed)) < .00001);
    }
    assert.equal(debugTimeline(dockAt, at, result).reveal, 0);
    assert.ok(Math.abs(debugTimeline(dockAt + 1, at, result).reveal - 1) < .001);
    assert.equal(debugTimeline(100, at, result).reveal, revealTiming(result).end);
  }
});
test('pending manual responses never expose personal results; returning now continues the same clock', () => {
  const pending = debugTimeline(35, null, result);
  assert.equal(pending.available, false); assert.equal(pending.prelude, 18); assert.equal(pending.reveal, 0);
  const returned = debugTimeline(35, 35, result);
  assert.equal(returned.available, true); assert.equal(returned.prelude, 18); assert.equal(returned.reveal, 0);
});
test('seeking backwards restores the correct response state and exact frame', () => {
  const first = debugTimeline(9.3, 20, result);
  assert.equal(debugTimeline(26, 20, result).available, true);
  assert.deepEqual(debugTimeline(9.3, 20, result), first);
  assert.equal(first.available, false);
  assert.equal(debugTimeline(18.1, 35, result).phase, 'Waiting for response');
});
test('reduced motion waits for data then immediately completes', () => {
  assert.equal(debugTimeline(19, 20, result, true).complete, false);
  assert.equal(debugTimeline(20, 20, result, true).complete, true);
});
test('all debug fixtures keep a complete podium and one self row', () => {
  for (const fixture of DEBUG_SCENARIOS) {
    const rows = leaderboardRows(fixture.result);
    assert.deepEqual(rows.slice(0, 3).map(row => row.person.rank), [1, 2, 3]);
    assert.equal(rows.filter(row => row.isYou).length, 1);
  }
  assert.deepEqual(leaderboardRows(debugResult('7')).map(row => row.person.rank), [1, 2, 3, 5, 6, 7]);
});
test('preview accepts only bounded controls and known mock scenarios', () => {
  const valid = { scenario: '47', time: 12, responseAt: null, reducedMotion: false };
  assert.equal(validDebugSettings(valid), true);
  for (const patch of [{ time: NaN }, { time: Infinity }, { time: -1 }, { scenario: 'unknown' }, { responseAt: -1 }, { reducedMotion: 'false' }]) {
    assert.equal(validDebugSettings({ ...valid, ...patch }), false);
  }
});

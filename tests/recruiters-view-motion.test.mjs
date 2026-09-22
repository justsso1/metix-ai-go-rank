import assert from 'node:assert/strict';
import test from 'node:test';
import { getMockShareResults } from '../src/recruiters-view/mock.ts';
import { advancePrelude, assessmentProgress, cardPresentation, coarsePose, assessPose, sortedPose, readyListPose, preludeSpeed, rankedEntry, MATERIAL_SETTLE_DURATION, revealLayers, revealTiming, scrollState, selectionSheen, omissionLabel, scoreValue, SCORE_TARGETS } from '../src/recruiters-view/ranking-motion.ts';
const maya = getMockShareResults().find(result => result.profile.handle === 'maya-chen-se');
const near = (a, b) => { for (const key of ['x', 'y', 'w', 'h', 'angle']) assert.ok(Math.abs((a[key] ?? 0) - (b[key] ?? 0)) < .001, `${key}: ${a[key]} != ${b[key]}`); };

test('all six retained cards have identical geometry across each phase boundary', () => {
  for (const mobile of [false, true]) for (let id = 0; id < 6; id++) {
    near(coarsePose(id, 6, mobile), assessPose(id, mobile));
    near(sortedPose(id, 12, mobile), assessPose(id, mobile));
    near(sortedPose(id, 18, mobile), readyListPose(id, mobile));
  }
});
test('body transformation and scores advance monotonically without overshoot', () => {
  for (let id = 0; id < 6; id++) for (let d = 0; d < 3; d++) {
    let previous = 0, line = 0;
    for (let t = 0; t < 21; t += .025) {
      const value = scoreValue(id, d, t), progress = assessmentProgress(t, d);
      assert.ok(value >= previous && value <= SCORE_TARGETS[id][d]);
      assert.ok(progress >= line && progress <= 1);
      previous = value; line = progress;
    }
    assert.equal(previous, SCORE_TARGETS[id][d]);
  }
});
test('an early response compresses the remaining prelude; a slow response does not restart it', () => {
  for (const responseAt of [0, 1.88, 7, 12, 17, 18]) {
    const speed = preludeSpeed(responseAt);
    assert.equal(advancePrelude(responseAt, 2.401, speed), 18);
    assert.ok(advancePrelude(responseAt, .01, speed) >= responseAt);
  }
  assert.equal(advancePrelude(18, 90), 18);
});
test('rank 47 scrolls through real positions and only omits rows after rank 4 exits', () => {
  const timing = revealTiming(maya);
  let previous = 0;
  for (let t = 0; t < timing.end; t += .01) {
    const state = scrollState(maya, t);
    assert.ok(state.offset >= previous);
    if (state.offset < 1) assert.equal(state.omission, 0);
    previous = state.offset;
  }
  assert.equal(previous, 41);
  assert.equal(scrollState(maya, timing.scrollEnd).firstRank, 45);
  assert.equal(omissionLabel(45), '…');
  assert.ok(timing.expandStart > timing.selectStart + .6);
});
test('adjacent ranks do not reserve an omission gap, and rank 7 waits for rank 4 to leave', () => {
  for (const rank of [1, 2, 3, 4, 5, 6]) {
    const result = { ...maya, ranking: { ...maya.ranking, rank } };
    assert.equal(scrollState(result, 100).omission, 0);
    assert.equal(revealTiming(result).offset, 0);
  }
  const seven = { ...maya, ranking: { ...maya.ranking, rank: 7 } }, timing = revealTiming(seven);
  assert.equal(scrollState(seven, timing.scrollEnd - .01).omission, 0);
  assert.equal(scrollState(seven, timing.selectStart).omission, 1);
  assert.equal(omissionLabel(5), '…');
});
test('unknown intermediate candidates stay unknown; returned identities are preserved', () => {
  assert.equal(rankedEntry(maya, 47).fullName, maya.profile.fullName);
  assert.equal(rankedEntry(maya, 1), maya.topThree[0]);
  assert.equal(rankedEntry(maya, 10), undefined);
  const provided = { ...maya.topThree[0], rank: 10, id: 'rank-10' };
  assert.equal(rankedEntry({ ...maya, rankingEntries: [provided] }, 10), provided);
});

test('selection light passes once and is gone before the row expands', () => {
  const timing = revealTiming(maya);
  assert.equal(selectionSheen(-1).opacity, 0);
  assert.equal(selectionSheen(0).opacity, 0);
  assert.ok(selectionSheen(.35).opacity > .5);
  assert.equal(selectionSheen(timing.expandStart - timing.selectStart).opacity, 0);
  let previous = -Infinity;
  for (let t = 0; t < 3; t += 1 / 60) {
    const sheen = selectionSheen(t);
    assert.ok(sheen.x >= previous, 'light must not reverse or replay');
    previous = sheen.x;
  }
});

test('card tilts gently after growing and is flat and unlit before controls enter', () => {
  for (const mobile of [false, true]) {
    let previous = cardPresentation(0, mobile);
    for (let t = 0; t < 3; t += 1 / 60) {
      const frame = cardPresentation(t, mobile);
      assert.ok(Math.abs(frame.rotateY) <= 3 && Math.abs(frame.rotateX) <= 1);
      assert.ok(Math.abs(frame.rotateY - previous.rotateY) < .2, 'no sudden frame-to-frame turn');
      previous = frame;
    }
    const handoff = cardPresentation(MATERIAL_SETTLE_DURATION, mobile);
    assert.ok(Math.abs(handoff.rotateX) < 1e-10 && Math.abs(handoff.rotateY) < 1e-10);
    assert.ok(handoff.lightOpacity < 1e-10, 'final static card must not flash at handoff');
  }
  assert.equal(Math.abs(cardPresentation(.3).rotateY), 0, 'do not rock the tiny source row');
  assert.ok(Math.abs(cardPresentation(1, true).rotateY) < Math.abs(cardPresentation(1).rotateY));
});

test('leaderboard overlay never exposes the canvas, and controls enter only after the card settles', () => {
  const timing = revealTiming(maya), end = timing.end - timing.expandStart;
  let previousActions = 0, previousOpportunities = 0;
  for (let t = 0; t < end; t += 1 / 120) {
    const layers = revealLayers(t);
    const destinationOpacity = layers.destinationVisible ? 1 : 0;
    const composite = layers.overlayOpacity + destinationOpacity * (1 - layers.overlayOpacity);
    assert.equal(composite, 1, 'a translucent handoff would flash the dark canvas');
    if (t < MATERIAL_SETTLE_DURATION) {
      assert.equal(layers.actions + layers.opportunities, 0);
    }
    assert.ok(layers.actions >= previousActions && layers.opportunities >= previousOpportunities);
    assert.ok(layers.actions >= layers.opportunities, 'show share controls before opportunities');
    previousActions = layers.actions; previousOpportunities = layers.opportunities;
  }
  assert.deepEqual(revealLayers(end), { destinationVisible: true, overlayOpacity: 0, actions: 1, opportunities: 1 });
  assert.equal(revealLayers(0).destinationVisible, false, 'replaying hides the destination again');
});

test('reduced motion suppresses both light sweeps and the material tilt', () => {
  for (let t = 0; t < 3; t += .1) {
    const frame = cardPresentation(t, false, true), sheen = selectionSheen(t, true);
    assert.equal(Math.abs(frame.rotateX) + Math.abs(frame.rotateY) + frame.lightOpacity, 0);
    assert.equal(sheen.opacity + sheen.illumination, 0);
  }
});

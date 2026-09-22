import assert from 'node:assert/strict';
import test from 'node:test';
import { cardFlight } from '../src/recruiters-view/card-flight.ts';
import { cardLayout } from '../src/recruiters-view/ranking-card.ts';
import { getMockShareResults } from '../src/recruiters-view/mock.ts';
import { EXPAND_DURATION, MATERIAL_SETTLE_DURATION } from '../src/recruiters-view/ranking-motion.ts';

const samples = getMockShareResults();
for (const width of [327.625, 643.375]) {
  test(`real card grows out of the row and keeps its resting geometry at ${width}px`, () => {
    for (const result of samples) {
      const mobile = width < 420, layout = cardLayout(result, Math.round(width));
      const target = { x: 24, y: 110, w: width, h: width * layout.height / layout.width };
      const source = { x: 728, y: 620, w: 385, h: 86 };
      const before = cardFlight(source, target, -1, mobile);
      assert.equal(before['--card-flight-visible'], 'hidden');
      const first = cardFlight(source, target, 0, mobile);
      assert.equal(parseFloat(first['--card-flight-x']) + target.x, source.x);
      assert.equal(parseFloat(first['--card-flight-y']) + target.y, source.y);
      assert.equal(parseFloat(first['--card-flight-width']), source.w);
      assert.equal(parseFloat(first['--card-flight-height']), source.h);
      let previousDistance = Infinity;
      for (let t = 0; t <= MATERIAL_SETTLE_DURATION + 1; t += 1 / 120) {
        const frame = cardFlight(source, target, t, mobile);
        assert.equal(frame['--card-flight-visible'], 'visible');
        const distance = Math.hypot(parseFloat(frame['--card-flight-x']), parseFloat(frame['--card-flight-y']));
        assert.ok(distance <= previousDistance, 'card must not jump away from its destination');
        previousDistance = distance;
        if (t >= EXPAND_DURATION) {
          assert.equal(distance, 0);
          assert.equal(frame['--card-flight-width'], '100%');
          assert.equal(frame['--card-flight-height'], '100%');
          assert.equal(frame['--card-flight-artwork-opacity'], '1');
        }
      }
      assert.deepEqual(cardFlight(source, target, MATERIAL_SETTLE_DURATION, mobile), cardFlight(source, target, 10, mobile), 'there is no end-of-animation handoff or geometry change');
    }
  });
}

import assert from 'node:assert/strict';
import test from 'node:test';
import { cardStory, withPreviousRanking } from '../src/recruiters-view/card-story.ts';
import { cardLayout, rankingCardSvg } from '../src/recruiters-view/ranking-card.ts';
import { getMockShareResults } from '../src/recruiters-view/mock.ts';
import { applySharedMockState, finishRanking, initialCampaign, readCampaign, recordProfileCheck, refreshMockRanking, resultShareUrl } from '../src/recruiters-view/campaign.ts';

const maya = getMockShareResults().find(result => result.profile.handle === 'maya-chen-se');
const atRank = (rank, poolSize = 1000) => ({ ...maya, ranking: { kind: 'exact', rank, poolSize } });

test('card story and CTA use exact 5% and 50% boundaries, independent of rounded badges', () => {
  for (const [rank, kind, primaryAction] of [[1, 'top', 'share'], [50, 'top', 'share'], [51, 'middle', 'share'], [500, 'middle', 'share'], [501, 'lower', 'improve'], [1000, 'lower', 'improve']]) {
    const story = cardStory(atRank(rank));
    assert.equal(story.kind, kind);
    assert.equal(story.primaryAction, primaryAction);
    assert.equal(story.comparison, null);
  }
  assert.equal(cardStory(atRank(5, 99)).kind, 'middle');
  assert.equal(cardStory(atRank(143, 12431)).kind, 'top', 'Reference numbers must not override the percentile rule.');
});

test('headlines use actual people behind, percentile and peer group', () => {
  assert.equal(cardStory(atRank(47, 12431)).headline, 'Recruiters find you before 12,384 other people.');
  assert.equal(cardStory(atRank(143, 1240)).headline, "You're ahead of 88% of Senior Backend Engineers in Seattle.");
  assert.equal(cardStory(atRank(9883, 12431)).headline, '12,431 Senior Backend Engineers in Seattle. Recruiters see the first 50.');
});

test('an improved rank takes precedence even outside the top 5%, including within one page', () => {
  const improved = cardStory(withPreviousRanking(atRank(412, 1240), atRank(984, 1240)));
  assert.equal(improved.kind, 'improved');
  assert.equal(improved.primaryAction, 'share');
  assert.equal(improved.headline, 'Page 40 → page 17. Profile updated.');
  assert.deepEqual(improved.comparison, { rank: 984, poolSize: 1240, page: 40, passed: 572 });
  const samePage = cardStory(withPreviousRanking(atRank(412), atRank(413)));
  assert.equal(samePage.headline, 'Profile updated. You moved up 1 place.');
  const stillLowerHalf = cardStory(withPreviousRanking(atRank(700), atRank(900)));
  assert.equal(stillLowerHalf.kind, 'improved');
  assert.equal(stillLowerHalf.primaryAction, 'improve', 'Sharing remains secondary beyond the top half, even after an improvement.');
});

test('unchanged, worse, different-scope and invalid snapshots never claim improvement', () => {
  const current = atRank(143);
  const previous = atRank(900);
  const unrelated = [
    current, atRank(140), atRank(1001),
    { ...previous, profile: { ...previous.profile, handle: 'another-person' } },
    ...['jobTitle', 'location', 'seniorityBand', 'companyType'].map(key => ({ ...previous, query: { ...previous.query, [key]: 'Different scope' } })),
    { ...previous, ranking: { kind: 'band', label: 'Top 90%', poolSize: 1000 } },
  ];
  for (const snapshot of unrelated) {
    assert.equal(cardStory(withPreviousRanking(current, snapshot)).kind, 'middle');
    assert.equal(cardStory(withPreviousRanking(current, snapshot)).primaryAction, 'share');
  }
  assert.equal(cardStory(atRank(0)).kind, 'unavailable');
});

test('only completed calculations publish comparison data, and later unchanged results clear it', () => {
  const now = Date.parse('2026-09-17T12:00:00Z');
  const waiting = recordProfileCheck(initialCampaign(maya, now), true, now);
  assert.equal(cardStory(waiting.result).kind, 'top');
  assert.strictEqual(finishRanking(waiting, Date.parse(waiting.nextRankingAt) - 1), waiting);
  const ready = finishRanking(waiting, Date.parse(waiting.nextRankingAt));
  assert.equal(cardStory(ready.result).kind, 'improved');
  const first = refreshMockRanking(ready.result, '2026-09-18T12:00:00Z');
  assert.equal(first.ranking.rank, 1);
  assert.equal(cardStory(first).kind, 'improved');
  const unchanged = refreshMockRanking(first, '2026-09-19T12:00:00Z');
  assert.equal(cardStory(unchanged).kind, 'top');
  assert.equal(cardStory(unchanged).comparison, null);
});

test('shared updated links and saved campaign snapshots restore the same comparison', () => {
  const updated = refreshMockRanking(maya, '2026-09-17T12:00:00.000Z');
  const restored = applySharedMockState(maya, new URL(resultShareUrl(updated)).searchParams);
  assert.deepEqual(restored, updated);
  assert.deepEqual(cardStory(restored), cardStory(updated));
  const { previousRanking, ...oldStoredResult } = updated;
  const stored = { ...initialCampaign(updated), result: oldStoredResult, previous: maya, status: 'updated' };
  const originalStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: () => JSON.stringify(stored) };
    assert.deepEqual(readCampaign(maya).result.previousRanking, previousRanking);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

test('comparison artwork fits narrow cards and keeps search, tags and recruiter score', () => {
  for (const rank of [412, 9882]) for (const width of [280, 328, 358, 640]) {
    const result = withPreviousRanking(atRank(rank, 12431), atRank(9883, 12431));
    const layout = cardLayout(result, width);
    assert.ok(layout.rankX > layout.pad + layout.oldRankWidth);
    assert.ok(layout.rankX + layout.rankWidth <= width - layout.pad);
    assert.ok(layout.tags.every(tag => tag.y >= layout.metricsY + layout.metricsHeight && tag.y + 26 <= layout.height - layout.pad));
    const query = layout.metrics.find(metric => metric.searchLines);
    const lastQueryBaseline = 44 + (layout.metricLabelLines - 1) * 13 + (query.searchLines.length - 1) * 19;
    assert.ok(lastQueryBaseline + 14 < layout.firstMetricRowHeight);
    const svg = rankingCardSvg(result, width);
    assert.ok(svg.includes('Profile updated.'));
    assert.ok(svg.includes('TOP SEARCH YOU APPEAR IN'));
    assert.ok(svg.includes(result.topSearch));
    assert.ok(svg.includes('Recruiter reply score'));
    assert.ok(!svg.includes('WHAT CHANGED'));
    assert.ok(!svg.includes('One line changed'));
    for (const keyword of result.keywords) assert.ok(svg.includes(keyword));
  }
});

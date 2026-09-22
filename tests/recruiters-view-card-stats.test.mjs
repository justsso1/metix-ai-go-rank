import assert from 'node:assert/strict';
import test from 'node:test';
import { getMockShareResults, hasMatchingShareSnapshot, upgradeMockSnapshot } from '../src/recruiters-view/mock.ts';
import { readCampaign, refreshMockRanking } from '../src/recruiters-view/campaign.ts';
import { cardLayout, rankingCardStats, rankingCardSvg } from '../src/recruiters-view/ranking-card.ts';

const samples = getMockShareResults();
const sample = samples[0];
const atRank = (rank, poolSize = 100) => ({ ...sample, ranking: { kind: 'exact', rank, poolSize } });

test('ahead and behind exclude the candidate, including the first and last places', () => {
  for (const [rank, pool, ahead, behind] of [[1, 100, 0, 99], [100, 100, 99, 0], [1, 1, 0, 0], [47, 12431, 46, 12384], [5, 640, 4, 635]]) {
    const stats = rankingCardStats(atRank(rank, pool));
    assert.equal(stats.ahead, ahead);
    assert.equal(stats.behind, behind);
    assert.equal(stats.ahead + stats.behind + 1, pool);
  }
});

test('search pages contain exactly 25 people and start at page one', () => {
  for (const [rank, page] of [[1, 1], [25, 1], [26, 2], [47, 2], [50, 2], [51, 3], [100, 4]]) {
    assert.equal(rankingCardStats(atRank(rank)).page, page);
  }
});

test('position rail grows toward better ranks and reports the share of other people behind you', () => {
  for (const [rank, pool, percent] of [[1, 100, 100], [100, 100, 0], [92, 980, 90], [72, 101, 29]]) {
    const result = atRank(rank, pool);
    const layout = cardLayout(result);
    const svg = rankingCardSvg(result);
    const rail = svg.match(/<g class="rv-art-position">([\s\S]*?)<g class="rv-art-metrics">/)[1];
    assert.ok(rail.replace(/<[^>]*>/g, '').includes(`You rank ahead of ${percent}% of people.`));
    const fillWidth = Number(rail.match(/class="rv-art-position-fill"[^>]*width="([^"]+)"/)[1]);
    assert.ok(Math.abs(fillWidth / layout.inner - (pool - rank) / (pool - 1)) < 1e-10);
    assert.match(rail, /FOUND LAST[\s\S]*text-anchor="end"[^>]*>FOUND FIRST/);
    assert.ok(!rail.includes('PAGE '), 'the rail must not repeat the page metric');
    assert.ok(svg.includes(`Page ${Math.ceil(rank / 25)}`));
  }
  for (const result of [atRank(1, 1), atRank(0), { ...sample, ranking: { kind: 'band', label: 'Top 10%', poolSize: 100 } }]) {
    const svg = rankingCardSvg(result);
    assert.ok(!svg.includes('You rank ahead of'), 'do not invent a comparison without other candidates or an exact rank');
    assert.ok(!svg.includes('rv-art-position-fill'));
  }
});

test('banded or invalid rankings do not invent exact counts or page numbers', () => {
  for (const ranking of [{ kind: 'band', label: 'Top 10%', poolSize: 100 }, ...[0, -1, 101, 1.5, NaN].map(rank => ({ kind: 'exact', rank, poolSize: 100 }))]) {
    const stats = rankingCardStats({ ...sample, ranking });
    assert.equal(stats.ahead, null);
    assert.equal(stats.behind, null);
    assert.equal(stats.page, null);
  }
});

test('reply score is an independent 0–5 value; missing values never fall back to rank', () => {
  for (const score of [0, 4.2, 5]) {
    assert.equal(rankingCardStats({ ...sample, recruiterReplyScore: score }).replyScore, score);
    const updated = refreshMockRanking({ ...sample, recruiterReplyScore: score }, '2026-09-17T12:00:00Z');
    assert.equal(rankingCardStats(updated).replyScore, score);
  }
  for (const score of [undefined, null, -1, 5.1, NaN, Infinity]) {
    const result = { ...sample, recruiterReplyScore: score };
    assert.equal(rankingCardStats(result).replyScore, null);
    assert.match(rankingCardSvg(result), /Recruiter reply score: Not available/);
  }
});

test('shared artwork keeps the new stats, search and tags within narrow and wide cards', () => {
  for (const result of samples) for (const width of [280, 328, 358, 640]) {
    const layout = cardLayout(result, width);
    assert.ok(layout.metricsY > layout.contextY + 34);
    assert.ok(layout.searchLabelY > layout.metricsY + layout.metricRowHeight * 2);
    assert.ok(layout.tags.every(tag => tag.y > layout.searchLabelY && tag.y + 26 <= layout.height - layout.pad));
    const svg = rankingCardSvg(result, width);
    for (const metric of layout.metrics) assert.ok(svg.includes(metric.value));
    assert.ok(!svg.includes('25 people per page'));
    assert.ok(svg.includes(result.topSearch));
    for (const keyword of result.keywords) assert.ok(svg.includes(keyword));
  }
});

test('old preview results gain scores without losing saved ranks or pending checks', () => {
  const { recruiterReplyScore, ...oldResult } = sample;
  assert.equal(hasMatchingShareSnapshot(upgradeMockSnapshot(oldResult)), true);
  for (const score of [null, 0, 3.1]) {
    const explicit = { ...oldResult, recruiterReplyScore: score };
    assert.strictEqual(upgradeMockSnapshot(explicit), explicit);
  }
  const revised = refreshMockRanking(oldResult, '2026-09-17T12:00:00Z');
  const stored = { result: revised, previous: oldResult, status: 'waiting', nextRankingAt: '2026-09-17T17:00:00Z', rankUpdates: true };
  const originalStorage = globalThis.localStorage;
  try {
    globalThis.localStorage = { getItem: () => JSON.stringify(stored) };
    const restored = readCampaign(sample);
    assert.deepEqual(restored.result.ranking, revised.ranking);
    assert.equal(restored.result.revision, revised.revision);
    assert.equal(restored.result.recruiterReplyScore, recruiterReplyScore);
    assert.equal(restored.previous.recruiterReplyScore, recruiterReplyScore);
    assert.equal(restored.status, 'waiting');
    assert.equal(restored.nextRankingAt, stored.nextRankingAt);
    assert.equal(restored.rankUpdates, true);
  } finally {
    if (originalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = originalStorage;
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { getMockShareResults } from '../src/recruiters-view/mock.ts';
import { campaignKey, initialCampaign, qualifiesForJobs, readCampaign, refreshMockRanking } from '../src/recruiters-view/campaign.ts';
import { cardThemeName } from '../src/recruiters-view/card-theme.ts';
import { podiumFrame } from '../src/recruiters-view/podium-frame.ts';
import { completeTopThree, hasSeenRanking, leaderboardRows, rankingIdentity, rememberRanking } from '../src/recruiters-view/leaderboard.ts';

const samples = getMockShareResults();
const maya = samples.find(result => result.profile.handle === 'maya-chen-se');
const priya = samples.find(result => result.profile.handle === 'priya-nair-ml');

test('every podium finisher has the complete top three, including themselves exactly once', () => {
  for (const rank of [1, 2, 3]) {
    const result = samples.find(result => result.ranking.rank === rank);
    assert.ok(result);
    const rows = leaderboardRows(result);
    assert.deepEqual(rows.map(row => row.person.rank), [1, 2, 3]);
    assert.equal(rows.filter(row => row.isYou).length, 1);
    assert.equal(rows.find(row => row.isYou).person.fullName, result.profile.fullName);
    assert.equal(rows.find(row => row.isYou).person.rank, rank);
    assert.deepEqual(result.topThree.map(person => person.rank), [1, 2, 3]);
  }
});

test('standard leaderboards combine top three, nearest two, and self without overlaps', () => {
  assert.deepEqual(leaderboardRows(maya).map(row => row.person.rank), [1, 2, 3, 45, 46, 47]);
  assert.deepEqual(leaderboardRows(priya).map(row => row.person.rank), [1, 2, 3, 4, 5]);
  for (const result of samples) {
    const rows = leaderboardRows(result);
    assert.equal(rows.filter(row => row.isYou).length, 1);
    assert.equal(new Set(rows.map(row => row.person.rank)).size, rows.length);
  }
});

test('card materials use percentile tiers, independently of Top 1% job eligibility', () => {
  assert.equal(qualifiesForJobs(priya.ranking), true);
  assert.equal(cardThemeName(priya.ranking), 'gold');
  assert.deepEqual([1, 2, 3, 4].map(rank => cardThemeName({kind:'exact', rank, poolSize:10})), ['gold', 'silver', 'bronze', 'standard']);
  assert.equal(qualifiesForJobs({kind:'exact', rank:1, poolSize:10}), false);
  assert.equal(cardThemeName({kind:'band', label:'Top 1%', poolSize:1000}), 'standard');
});

test('material thresholds include 10%, 20%, and 30% without rounding across boundaries', () => {
  const material = (rank, poolSize = 1000) => cardThemeName({ kind: 'exact', rank, poolSize });
  for (const [rank, expected] of [[1, 'gold'], [100, 'gold'], [101, 'silver'], [200, 'silver'], [201, 'bronze'], [300, 'bronze'], [301, 'standard'], [1000, 'standard']]) {
    assert.equal(material(rank), expected, `rank ${rank}`);
  }
  assert.equal(material(124, 1240), 'gold');
  assert.equal(material(125, 1240), 'silver');
  assert.equal(material(249, 1240), 'bronze');
  assert.equal(material(373, 1240), 'standard');
  for (const [rank, pool] of [[0, 100], [-1, 100], [1, 0], [101, 100], [1.5, 100], [1, Infinity]]) {
    assert.equal(material(rank, pool), 'standard');
  }
});

test('expanded material eligibility never grants a podium avatar frame beyond rank three', () => {
  for (const rank of [1, 2, 3]) assert.ok(podiumFrame(rank));
  for (const rank of [4, 5, 100, 150, 250]) {
    assert.notEqual(cardThemeName({ kind: 'exact', rank, poolSize: 1000 }), 'standard');
    assert.equal(podiumFrame(rank), undefined);
  }
});

test('recalculation preserves a complete podium when a regular candidate becomes first', () => {
  const improved = refreshMockRanking(maya, '2026-09-16T12:00:00Z');
  const first = refreshMockRanking(improved, '2026-09-16T17:00:00Z');
  assert.equal(first.ranking.rank, 1);
  assert.deepEqual(leaderboardRows(first).map(row => row.person.rank), [1, 2, 3]);
  assert.equal(leaderboardRows(first).filter(row => row.isYou).length, 1);
  assert.equal(first.topThree[0].fullName, maya.profile.fullName);
  assert.deepEqual(completeTopThree({...maya, ranking:{kind:'exact', rank:1, poolSize:2}}).map(person => person.rank), [1, 2]);
});

test('reveal memory distinguishes a new snapshot but not unrelated profile details', () => {
  const memory = new Map();
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:{getItem:key=>memory.get(key)??null, setItem:(key,value)=>memory.set(key,value)}});
  try {
    assert.equal(hasSeenRanking(maya), false);
    rememberRanking(maya);
    assert.equal(hasSeenRanking(structuredClone(maya)), true);
    const updated = refreshMockRanking(maya, '2026-09-16T12:00:00Z');
    assert.equal(hasSeenRanking(updated), false);
    assert.equal(rankingIdentity({...maya, topSearch:'Updated display copy'}), rankingIdentity(maya));
    assert.notEqual(rankingIdentity({...maya, query:{...maya.query, location:'Austin'}}), rankingIdentity(maya));
    rememberRanking(updated);
    assert.equal(hasSeenRanking(updated), true);
    assert.equal(hasSeenRanking(maya), true);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

test('existing saved progress is upgraded with full podium data without losing pending checks', () => {
  const saved = {...initialCampaign(maya), status:'waiting', rankUpdates:true};
  saved.result = structuredClone(maya);
  delete saved.result.topThree;
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', {configurable:true, value:{getItem:key=>key===campaignKey(maya.profile.handle)?JSON.stringify(saved):null}});
  try {
    const restored = readCampaign(maya);
    assert.equal(restored.status, 'waiting');
    assert.equal(restored.rankUpdates, true);
    assert.equal(restored.nextRankingAt, saved.nextRankingAt);
    assert.deepEqual(restored.result.topThree.map(person => person.rank), [1, 2, 3]);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
    else delete globalThis.localStorage;
  }
});

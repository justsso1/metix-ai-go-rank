import assert from 'node:assert/strict';
import test from 'node:test';
import { getMockShareResults, hasMatchingShareSnapshot, parseLinkedInInput } from '../src/recruiters-view/mock.ts';
import { applySharedMockState, finishRanking, initialCampaign, matchedJobs, nextRankingTime, qualifiesForJobs, RANK_INTERVAL_MS, recordProfileCheck, refreshMockRanking, resultShareUrl, topPercent } from '../src/recruiters-view/campaign.ts';
import { shareMetadata } from '../src/recruiters-view/share.ts';

const samples = getMockShareResults();
const maya = samples.find(result => result.profile.handle === 'maya-chen-se');
const jordan = samples.find(result => result.profile.handle === 'jordan-hale-pm');
const priya = samples.find(result => result.profile.handle === 'priya-nair-ml');
const now = Date.parse('2026-09-15T12:30:00Z');

test('Top 1% eligibility uses the precise rank-to-pool boundary', () => {
  const ranking = (rank, poolSize) => ({ kind: 'exact', rank, poolSize });
  assert.equal(qualifiesForJobs(ranking(10, 1000)), true);
  assert.equal(qualifiesForJobs(ranking(11, 1000)), false);
  assert.equal(qualifiesForJobs(ranking(12, 1240)), true);
  assert.equal(qualifiesForJobs(ranking(13, 1240)), false);
  assert.equal(topPercent(ranking(47, 1240)), 4);
  assert.equal(topPercent(ranking(1, 1240)), 1);
  for (const invalid of [ranking(0, 1000), ranking(2, 1), ranking(1, 0), ranking(NaN, 1000), { kind: 'band', label: 'top 1%', poolSize: 1000 }]) {
    assert.equal(qualifiesForJobs(invalid), false);
  }
});

test('an eligible initial result gets jobs without an optimization step', () => {
  assert.equal(qualifiesForJobs(priya.ranking), true);
  const jobs = matchedJobs(priya);
  assert.equal(jobs.length, 10);
  assert.equal(new Set(jobs.map(job => job.id)).size, 10);
  assert.deepEqual(jobs.slice(0, 3), matchedJobs(priya).slice(0, 3));
  assert.equal(initialCampaign(priya, now).rankUpdates, false);
});

test('detecting edits keeps the old rank, image, and suggestions until the next calculation', () => {
  const initial = initialCampaign(maya, now);
  const waiting = recordProfileCheck(initial, true, now);
  assert.equal(waiting.status, 'waiting');
  assert.strictEqual(waiting.result, maya);
  assert.equal(hasMatchingShareSnapshot(waiting.result), true);
  assert.equal(qualifiesForJobs(waiting.result.ranking), false);
  assert.strictEqual(finishRanking(waiting, Date.parse(waiting.nextRankingAt) - 1), waiting);
  const repeated = recordProfileCheck(waiting, true, now + 60_000);
  assert.strictEqual(repeated, waiting, 'Repeated checks must not keep delaying the scheduled update.');
});

test('a completed calculation preserves the previous result and can unlock jobs', () => {
  const waiting = recordProfileCheck(initialCampaign(maya, now), true, now);
  const ready = finishRanking(waiting, Date.parse(waiting.nextRankingAt));
  assert.equal(ready.status, 'updated');
  assert.strictEqual(ready.previous, maya);
  assert.equal(ready.result.ranking.rank, 12);
  assert.equal(qualifiesForJobs(ready.result.ranking), true);
  assert.equal(ready.rankUpdates, false);
  assert.notEqual(ready.result.profileVersion, maya.profileVersion);
  assert.ok(Date.parse(ready.result.rankedAt) > Date.parse(maya.rankedAt));
});

test('no changes, unchanged ranks, and worse ranks are supported', () => {
  const unchanged = recordProfileCheck(initialCampaign(maya, now), false, now);
  assert.equal(unchanged.status, 'unchanged');
  assert.strictEqual(finishRanking(unchanged, now + RANK_INTERVAL_MS), unchanged);
  assert.equal(refreshMockRanking(priya, new Date(now).toISOString()).ranking.rank, priya.ranking.rank);
  assert.ok(refreshMockRanking(jordan, new Date(now).toISOString()).ranking.rank > jordan.ranking.rank);
});

test('ranking periods advance by five hours and do not reuse a completed time', () => {
  const next = Date.parse(nextRankingTime(now));
  assert.ok(next > now && next - now <= RANK_INTERVAL_MS);
  assert.equal(Date.parse(nextRankingTime(next)), next + RANK_INTERVAL_MS);
  const future = finishRanking(recordProfileCheck(initialCampaign(maya, now), true, now), next);
  assert.ok(Date.parse(recordProfileCheck(future, true, now).nextRankingAt) > next);
});

test('updated mock share links recreate their own snapshot, never the old personal OG', () => {
  for (const result of [maya, refreshMockRanking(maya, new Date(now + RANK_INTERVAL_MS).toISOString())]) {
    const url = new URL(resultShareUrl(result));
    assert.equal(url.hostname, 'go.metix.ai');
    if (hasMatchingShareSnapshot(result)) assert.equal(url.pathname, '/share/maya-chen-se');
    else {
      assert.deepEqual(applySharedMockState(maya, url.searchParams), result);
      url.searchParams.set('location', 'Austin');
      assert.deepEqual(applySharedMockState(maya, url.searchParams), result, 'The comparison scope comes from the result, not URL overrides.');
      assert.equal(shareMetadata(result).image, '/recruiters-view/og/default.png');
    }
  }
});

test('public profile validation rejects spoofed hosts and malformed URL escapes without throwing', () => {
  for (const input of ['https://evil.test/linkedin.com/in/maya', 'https://notlinkedin.com/in/maya', 'https://linkedin.com.evil.test/in/maya', 'https://linkedin.com/in/%E0%A4%A', 'https://linkedin.com/in/a%2Fb']) {
    assert.equal(parseLinkedInInput(input).ok, false);
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { getMockShareResults } from '../src/recruiters-view/mock.ts';
import { refreshMockRanking, applySharedMockState } from '../src/recruiters-view/campaign.ts';
import { campaignAddress, campaignPage } from '../src/recruiters-view/routes.ts';
import { cardLayout, rankingCardSvg } from '../src/recruiters-view/ranking-card.ts';

const samples = getMockShareResults();
test('entry, result and task addresses are distinct; legacy result links still resolve', () => {
  assert.equal(campaignPage('/recruiters-view/'), 'entry');
  assert.equal(campaignPage('/recruiters-view/', '?u=maya-chen-se'), 'result');
  for (const result of samples) {
    for (const page of ['result','improve','opportunities']) {
      const url = new URL(campaignAddress(result, page), 'http://localhost');
      assert.equal(campaignPage(url.pathname, url.search), page);
      assert.equal(url.searchParams.get('resume'), '1');
      if (page !== 'result') assert.equal(url.searchParams.get('u'), result.profile.handle);
    }
  }
});
test('updated snapshots survive task/result navigation without changing scope or rank', () => {
  const original = samples[0];
  const result = refreshMockRanking(original, '2026-09-16T12:00:00.000Z');
  for (const page of ['result', 'improve', 'opportunities']) {
    const url = new URL(campaignAddress(result, page), 'http://localhost');
    assert.deepEqual(applySharedMockState(original, url.searchParams), result);
  }
});
test('one artwork includes the visible identity, rank, scope and search; page actions stay outside', () => {
  for (const result of samples) {
    const svg = rankingCardSvg(result);
    assert.ok(svg.includes(result.profile.fullName));
    assert.ok(svg.includes(`#${result.ranking.rank}`));
    assert.ok(svg.includes(result.query.jobTitle));
    assert.ok(svg.includes(result.topSearch));
    assert.ok(!/Share my ranking|Download card|<button|<a\s/.test(svg));
  }
});
test('card layout wraps without placing keyword chips outside mobile bounds', () => {
  for (const result of samples) for (const width of [280, 328, 358, 640]) {
    const layout = cardLayout(result, width);
    for (const tag of layout.tags) {
      assert.ok(tag.x >= layout.pad && tag.x + tag.width <= width - layout.pad + 1);
      assert.ok(tag.y + 26 <= layout.height - layout.pad);
    }
    assert.ok(layout.searchLabelY > layout.contextY);
  }
});
test('untrusted profile text is escaped inside the shared SVG', () => {
  const result = structuredClone(samples[0]);
  result.profile.fullName = '<script>alert(1)</script>';
  result.topSearch = '"/><script>malicious</script>';
  const svg = rankingCardSvg(result);
  assert.ok(!svg.includes('<script>'));
  assert.ok(svg.includes('&lt;script&gt;'));
});
test('proportional rank digits leave room for the candidate count', () => {
  const result = structuredClone(samples[0]);
  result.ranking = { kind: 'exact', rank: 243, poolSize: 743 };
  assert.ok(cardLayout(result).rankWidth >= 208);
  result.ranking = { kind: 'exact', rank: 1000, poolSize: 9999 };
  assert.equal(cardLayout(result, 280).poolWrap, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { getMockShareResults, sharePageUrl, shareText } from '../src/recruiters-view/mock.ts';
import { campaignAddress, missingResultAddress, campaignPage } from '../src/recruiters-view/routes.ts';
import { resultShareUrl, refreshMockRanking } from '../src/recruiters-view/campaign.ts';
import { shareMetadata } from '../src/recruiters-view/share.ts';
const result = getMockShareResults()[0];
test('all campaign links use new origin and recruiters-view routes', () => {
 assert.equal(sharePageUrl(result.profile.handle), `https://go.metix.ai/recruiters-view/share/${result.profile.handle}`);
 assert.equal(shareMetadata().path, '/recruiters-view/');
 for (const page of ['result','improve','opportunities']) {
  const url = new URL(campaignAddress(result,page), 'https://go.metix.ai');
  assert.equal(url.pathname, page === 'result' ? `/recruiters-view/share/${result.profile.handle}` : `/recruiters-view/${page}`);
  assert.equal(campaignPage(url.pathname,url.search),page);
 }
 assert.equal(new URL(missingResultAddress('unindexed'), 'https://go.metix.ai').pathname, '/recruiters-view/result');
 assert.equal(new URL(resultShareUrl(refreshMockRanking(result,'2026-09-22T00:00:00Z'))).pathname, '/recruiters-view/result');
 assert.match(shareText(result), /go\.metix\.ai/);
 assert.match(shareText(result), /go\.metix\.ai\/recruiters-view/);
});

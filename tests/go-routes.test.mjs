import test from 'node:test';
import assert from 'node:assert/strict';
import { getMockShareResults, sharePageUrl, shareText } from '../src/recruiters-view/mock.ts';
import { campaignAddress, missingResultAddress, campaignPage } from '../src/recruiters-view/routes.ts';
import { resultShareUrl, refreshMockRanking } from '../src/recruiters-view/campaign.ts';
import { shareMetadata } from '../src/recruiters-view/share.ts';
const result = getMockShareResults()[0];
test('all campaign links use new origin and root routes', () => {
 assert.equal(sharePageUrl(result.profile.handle), `https://go.metix.ai/share/${result.profile.handle}`);
 assert.equal(shareMetadata().path, '/');
 for (const page of ['result','improve','opportunities']) {
  const url = new URL(campaignAddress(result,page), 'https://go.metix.ai');
  assert.equal(url.pathname, page === 'result' ? `/share/${result.profile.handle}` : `/${page}`);
  assert.equal(campaignPage(url.pathname,url.search),page);
 }
 assert.equal(new URL(missingResultAddress('unindexed'), 'https://go.metix.ai').pathname, '/result');
 assert.equal(new URL(resultShareUrl(refreshMockRanking(result,'2026-09-22T00:00:00Z'))).pathname, '/result');
 assert.match(shareText(result), /go\.metix\.ai/);
 assert.doesNotMatch(shareText(result), /metix\.ai\/recruiters-view/);
});

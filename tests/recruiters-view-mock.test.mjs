import assert from 'node:assert/strict';
import test from 'node:test';
import {
  getMockShareResults,
  linkedinShareUrl,
  lookupRanking,
  parseLinkedInInput,
  ranksAbove,
  sharePageUrl,
  shareText,
} from '../src/recruiters-view/mock.ts';

test('parseLinkedInInput accepts public profile URLs', () => {
  const parsed = parseLinkedInInput('https://www.linkedin.com/in/maya-chen-se?trk=share');
  assert.deepEqual(parsed, {
    ok: true,
    handle: 'maya-chen-se',
    url: 'https://www.linkedin.com/in/maya-chen-se',
  });
});

test('synthetic share results never contain undefined names from signed hashes', async () => {
  const result = await lookupRanking('https://www.linkedin.com/in/og-card-preview');
  assert.equal(result.status, 'found');
  for (const person of [result.profile, ...result.peopleAbove.strongest, ...result.peopleAbove.justAhead]) {
    assert.doesNotMatch(person.fullName, /undefined/);
  }
});

test('parseLinkedInInput rejects GitHub and empty input', () => {
  assert.equal(parseLinkedInInput('https://github.com/maya').ok, false);
  assert.equal(parseLinkedInInput('').ok, false);
  assert.equal(parseLinkedInInput('https://metix.ai').ok, false);
});

test('ranksAbove shows top 3 and the three just ahead', () => {
  assert.deepEqual(ranksAbove(47), {
    strongest: [1, 2, 3],
    justAhead: [44, 45, 46],
  });
});

test('ranksAbove never includes the current rank or anyone below', () => {
  assert.deepEqual(ranksAbove(1), { strongest: [], justAhead: [] });
  assert.deepEqual(ranksAbove(4), { strongest: [1, 2, 3], justAhead: [] });
  assert.deepEqual(ranksAbove(5), { strongest: [1, 2, 3], justAhead: [4] });
  const { strongest, justAhead } = ranksAbove(86);
  assert.ok([...strongest, ...justAhead].every((rank) => rank < 86));
  assert.deepEqual(justAhead, [83, 84, 85]);
});

test('share helpers post the ranking to a public URL, not localhost', () => {
  const result = getMockShareResults().find(result => result.profile.handle === 'maya-chen-se');
  const pageUrl = sharePageUrl('maya-chen-se');
  assert.equal(pageUrl, 'https://go.metix.ai/share/maya-chen-se');

  const text = shareText(result);
  assert.equal(text, "Recruiters find me before 1,193 other people. Didn't know that was a stat until today. See where you stand → go.metix.ai");

  const linkedin = new URL(linkedinShareUrl(text, pageUrl));
  assert.equal(linkedin.origin + linkedin.pathname, 'https://www.linkedin.com/feed/');
  assert.equal(linkedin.searchParams.get('shareActive'), 'true');
  assert.equal(linkedin.searchParams.get('shareUrl'), pageUrl);
  assert.equal(linkedin.searchParams.get('text'), text);
  assert.doesNotMatch(linkedin.href, /127\.0\.0\.1/);
});

test('social copy fills all three templates with the current group data', () => {
  const maya = getMockShareResults().find(result => result.profile.handle === 'maya-chen-se');
  const atRank = (rank, poolSize) => ({ ...maya, ranking: { kind: 'exact', rank, poolSize } });
  assert.equal(shareText(atRank(47, 12431)), "Recruiters find me before 12,384 other people. Didn't know that was a stat until today. See where you stand → go.metix.ai");
  assert.equal(shareText(atRank(143, 1240)), "Apparently I'm ahead of 88% of backend engineers in Seattle in recruiter search. See where you stand → go.metix.ai");
  assert.equal(shareText(atRank(9883, 12431)), "12,431 backend engineers in Seattle. Recruiters see the first 50. That's the whole game. See where you stand → go.metix.ai");
});

test('social copy uses exact percentile boundaries and ignores the previous rank', () => {
  const maya = getMockShareResults().find(result => result.profile.handle === 'maya-chen-se');
  for (const [rank, start] of [[50, 'Recruiters find me'], [51, "Apparently I'm"], [500, "Apparently I'm"], [501, '1,000 backend engineers']]) {
    const result = { ...maya, ranking: { kind: 'exact', rank, poolSize: 1000 }, previousRanking: {
      profileHandle: maya.profile.handle, query: maya.query, ranking: { kind: 'exact', rank: 900, poolSize: 1000 },
    } };
    assert.ok(shareText(result).startsWith(start));
    assert.doesNotMatch(shareText(result), /Profile updated|moved from/);
  }
});

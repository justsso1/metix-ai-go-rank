import assert from 'node:assert/strict';
import test from 'node:test';
import { getMockShareResults } from '../src/recruiters-view/mock.ts';
import { matchedJobs } from '../src/recruiters-view/campaign.ts';
import { readShortlist, shortlistKey, submitShortlist, validShortlistEmail } from '../src/recruiters-view/job-shortlist.ts';
const samples = getMockShareResults(), priya = samples.find(r => r.profile.handle === 'priya-nair-ml');
const store = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; };

test('shortlist validates email and exact Top 1% eligibility before saving', async () => {
  const storage = store();
  for (const invalid of ['', 'missing-at', 'x@', 'x@y', 'a b@c.com', 'a@b@c.com']) {
    assert.equal(validShortlistEmail(invalid), false);
    await assert.rejects(submitShortlist(priya, invalid, { storage, delayMs: 0 }));
  }
  assert.equal(validShortlistEmail('test+jobs@example.com'), true);
  await assert.rejects(submitShortlist(samples[0], 'test@example.com', { storage, delayMs: 0 }));
  assert.equal(readShortlist(priya.profile.handle, storage), null);
});
test('successful request restores the submitted email separately from contact/notification preferences', async () => {
  const storage = store(), before = structuredClone(priya);
  const request = await submitShortlist(priya, '  jobs@example.com  ', { storage, delayMs: 0 });
  assert.equal(request.email, 'jobs@example.com');
  assert.deepEqual(readShortlist(priya.profile.handle, storage), request);
  assert.equal(readShortlist('alex-romero-be', storage), null);
  assert.deepEqual(priya, before);
  assert.deepEqual(matchedJobs(priya).slice(0, 3), matchedJobs(before).slice(0, 3));
});
test('failed and aborted submissions never leave a successful request', async () => {
  const storage = store();
  await assert.rejects(submitShortlist(priya, 'test@example.com', { storage: { ...storage, setItem() { throw new Error('Unavailable'); } }, delayMs: 0 }));
  assert.equal(readShortlist(priya.profile.handle, storage), null);
  const controller = new AbortController();
  const pending = submitShortlist(priya, 'test@example.com', { storage, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(readShortlist(priya.profile.handle, storage), null);
});
test('old unlock flags and malformed records cannot claim an email submission', () => {
  const storage = store(), key = shortlistKey(priya.profile.handle);
  for (const record of ['bad json', '{"jobsUnlocked":true}', '{"email":"x@example.com","submittedAt":"invalid"}']) {
    storage.setItem(key, record);
    assert.equal(readShortlist(priya.profile.handle, storage), null);
  }
});

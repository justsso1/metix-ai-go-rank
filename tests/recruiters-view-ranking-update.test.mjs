import assert from 'node:assert/strict';
import test from 'node:test';
import { rankingUpdateKey, readRankingUpdate, submitRankingUpdate } from '../src/recruiters-view/ranking-update.ts';
import { campaignKey, CONTACT_KEY } from '../src/recruiters-view/campaign.ts';

const store = () => {
  const values = new Map();
  return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
};

test('one profile-scoped request saves the edit acknowledgement and notification email without recalculating a rank', async () => {
  const storage = store(), handle = 'maya-chen-se';
  const ranking = JSON.stringify({ status: 'current', rank: 47 });
  storage.setItem(campaignKey(handle), ranking);
  storage.setItem(CONTACT_KEY, 'old@example.com');
  assert.equal(readRankingUpdate(handle, storage), null);
  const request = await submitRankingUpdate(handle, '  updated@example.com  ', { storage, delayMs: 0 });
  assert.equal(request.email, 'updated@example.com');
  assert.ok(Number.isFinite(Date.parse(request.submittedAt)));
  assert.deepEqual(readRankingUpdate(handle, storage), request);
  assert.equal(readRankingUpdate('jordan-hale-pm', storage), null);
  assert.equal(storage.getItem(campaignKey(handle)), ranking);
  assert.equal(storage.getItem(CONTACT_KEY), 'old@example.com');
});

test('invalid emails, failed saves and cancelled requests cannot acknowledge a profile update', async () => {
  const storage = store(), handle = 'maya-chen-se';
  for (const email of ['', 'not-an-email', 'a@b', 'a b@example.com']) {
    await assert.rejects(submitRankingUpdate(handle, email, { storage, delayMs: 0 }));
  }
  await assert.rejects(submitRankingUpdate(handle, 'test@example.com', {
    storage: { ...storage, setItem() { throw new Error('Storage unavailable'); } }, delayMs: 0,
  }));
  const controller = new AbortController();
  const pending = submitRankingUpdate(handle, 'test@example.com', { storage, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(readRankingUpdate(handle, storage), null);
});

test('legacy reminder flags and malformed records do not count as a combined request', () => {
  const storage = store(), handle = 'maya-chen-se';
  for (const record of ['bad json', '{"rankUpdates":true}', '{"email":"test@example.com","submittedAt":"invalid"}']) {
    storage.setItem(rankingUpdateKey(handle), record);
    assert.equal(readRankingUpdate(handle, storage), null);
  }
});

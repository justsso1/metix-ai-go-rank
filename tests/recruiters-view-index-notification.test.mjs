import assert from 'node:assert/strict';
import test from 'node:test';
import { indexNotificationKey, readIndexNotification, submitIndexNotification } from '../src/recruiters-view/index-notification.ts';
import { readShortlist } from '../src/recruiters-view/job-shortlist.ts';

const store = () => { const values = new Map(); return { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) }; };

test('index notification stores the submitted email per profile and survives a revisit', async () => {
  const storage = store();
  const saved = await submitIndexNotification('not-indexed', '  updates@example.com  ', { storage, delayMs: 0 });
  assert.equal(saved.email, 'updates@example.com');
  assert.deepEqual(readIndexNotification('not-indexed', storage), saved);
  assert.equal(readIndexNotification('another-profile', storage), null);
  assert.equal(readShortlist('not-indexed', storage), null);
});

test('invalid emails, cancelled requests and storage failures never confirm a notification', async () => {
  const storage = store();
  for (const email of ['', 'invalid', 'x@y', 'x y@example.com']) {
    await assert.rejects(submitIndexNotification('not-indexed', email, { storage, delayMs: 0 }));
  }
  const controller = new AbortController();
  const pending = submitIndexNotification('not-indexed', 'updates@example.com', { storage, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  await assert.rejects(submitIndexNotification('not-indexed', 'updates@example.com', { storage: { ...storage, setItem() { throw new Error('Storage unavailable'); } }, delayMs: 0 }));
  assert.equal(readIndexNotification('not-indexed', storage), null);
});

test('a stale preference or malformed saved request does not skip email collection', () => {
  const storage = store();
  for (const value of ['true', 'invalid json', '{"enabled":true}', '{"email":"invalid","submittedAt":"2026-09-16T12:00:00Z"}', '{"email":"updates@example.com","submittedAt":"invalid"}']) {
    storage.setItem(indexNotificationKey('not-indexed'), value);
    assert.equal(readIndexNotification('not-indexed', storage), null);
  }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';

async function environment({ hostname = 'go.metix.ai' } = {}) {
  const source = await readFile(new URL('../src/recruiters-view/analytics.ts', import.meta.url), 'utf8').catch(() => '');
  const listeners = new Map();
  const timers = new Map();
  const calls = [];
  const gaCalls = [];
  let timerId = 0;
  const window = {
    location: { hostname, pathname: '/', origin: `https://${hostname}` },
    gtag: (...args) => gaCalls.push(args),
    addEventListener(type, callback) { listeners.set(type, callback); },
    removeEventListener(type) { listeners.delete(type); },
    setTimeout(callback) { timers.set(++timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
  };
  const context = vm.createContext({ window });
  vm.runInContext(stripTypeScriptTypes(source).replaceAll('export ', '') + '\n globalThis.api = { trackCampaign: typeof trackCampaign === "function" ? trackCampaign : null, trackCampaignPage: typeof trackCampaignPage === "function" ? trackCampaignPage : null };', context);
  return { context, window, calls, gaCalls, timers, listeners, api: context.api,
    ready() { window.metix = { ready: true, track: (...args) => calls.push(args) }; listeners.get('metix:ready')?.(); },
  };
}

test('queues early calls until tracker init and releases its startup listener and timer', async () => {
  const env = await environment();
  assert.equal(typeof env.api.trackCampaign, 'function');
  env.api.trackCampaignPage('root');
  env.api.trackCampaign('lookup_submit', { source: 'entry', profile: 'private-person', email: 'secret@example.com' });
  assert.equal(env.calls.length, 0);
  env.ready();
  assert.equal(env.calls.length, 2);
  assert.equal(env.calls[0][0], 'page_view');
  assert.deepEqual(JSON.parse(JSON.stringify(env.calls[1][1])), { source: 'entry' });
  assert.equal(env.listeners.size, 0);
  assert.equal(env.timers.size, 0);
});

test('dedupes scene views and sends only static canonical GA URLs', async () => {
  const env = await environment();
  env.ready();
  for (const scene of ['root', 'root', 'result', 'share', 'share', 'improve', 'opportunities', 'root']) env.api.trackCampaignPage(scene);
  assert.equal(env.calls.length, 6);
  assert.deepEqual(env.gaCalls.map(call => call[2].page_location), [
    'https://go.metix.ai/', 'https://go.metix.ai/result', 'https://go.metix.ai/share/:handle',
    'https://go.metix.ai/improve', 'https://go.metix.ai/opportunities', 'https://go.metix.ai/',
  ]);
  assert.equal(env.gaCalls[2][2].page_title, 'Metix Rank — share');
});

test('drops startup queue after five seconds and can recover for later interactions', async () => {
  const env = await environment();
  env.api.trackCampaign('lookup_submit');
  for (const callback of [...env.timers.values()]) callback();
  assert.equal(env.listeners.size, 0);
  env.ready();
  assert.equal(env.calls.length, 0);
  env.api.trackCampaign('lookup_success', { result_type: 'found' });
  assert.equal(env.calls.length, 1);
});

test('caps pre-init events and removes unsafe property values', async () => {
  const env = await environment();
  for (let i = 0; i < 100; i += 1) env.api.trackCampaign('lookup_submit', { source: 'https://linkedin.com/in/private-person', count: i });
  env.ready();
  assert.ok(env.calls.length <= 40);
  assert.doesNotMatch(JSON.stringify(env.calls), /private-person|linkedin/);
});

test('localhost and preview never call either analytics sink', async () => {
  for (const hostname of ['localhost', 'preview.example.com']) {
    const env = await environment({ hostname });
    env.ready();
    env.api.trackCampaignPage('root');
    env.api.trackCampaign('lookup_submit');
    assert.equal(env.calls.length, 0);
    assert.equal(env.gaCalls.length, 0);
    assert.equal(env.timers.size, 0);
  }
});

test('real tracker startup plus React calls uploads one initial view and each transition', async () => {
  const env = await environment();
  const requests = [];
  const domListeners = new Map();
  const store = new Map();
  Object.assign(env.window, {
    localStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    sessionStorage: { getItem: key => store.get(key) ?? null, setItem: (key, value) => store.set(key, value) },
    fetch: async (url, options) => { requests.push({ url, options }); },
    setInterval: () => 1,
    dispatchEvent: event => env.listeners.get(event.type)?.(event),
  });
  Object.assign(env.context, { URL, Event, document: {
    cookie: '', readyState: 'loading', title: 'Private Person', referrer: '',
    addEventListener: (type, callback) => domListeners.set(type, callback),
  } });
  env.api.trackCampaignPage('root');
  vm.runInContext(await readFile(new URL('../src/scripts/metix-track.js', import.meta.url), 'utf8'), env.context);
  assert.equal(env.window.metix.tracker.queue.length, 0);
  domListeners.get('DOMContentLoaded')();
  env.api.trackCampaignPage('root');
  env.window.location.pathname = '/share/private-person';
  env.api.trackCampaignPage('share');
  env.api.trackCampaignPage('share');
  env.api.trackCampaign('share_copy', { method: 'link', profile: 'private-person' });
  env.window.location.pathname = '/improve';
  env.api.trackCampaignPage('improve');
  await env.window.metix.tracker.flush();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/track/collect/batch');
  const events = JSON.parse(requests[0].options.body).batchTrackEventList;
  assert.deepEqual(events.filter(event => event.eventType === 'page_view').map(event => event.pageId), ['go-rank-root', 'go-rank-share', 'go-rank-improve']);
  assert.ok(events.every(event => event.businessId === 'homepage'));
  assert.ok(events.every(event => event.properties.utm_source === 'direct'));
  assert.doesNotMatch(JSON.stringify(events), /private-person|Private Person/);
  assert.equal(env.timers.size, 0);
});

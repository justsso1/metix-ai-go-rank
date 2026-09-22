import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const scriptPath = new URL('../src/scripts/metix-track.js', import.meta.url);
const BATCH_URL = '/api/track/collect/batch';
const ATTRIBUTION_COOKIE = 'metix_attribution';
const AUTH_COOKIE = 'metix_auth_at';
const AUTH_REFRESH_COOKIE = 'metix_auth_rt';
const AUTH_USER_COOKIE = 'metix_auth_user';

function encodeAttribution(data, timestamp = Date.now(), version = 1) {
  return encodeURIComponent(JSON.stringify({ version, data, timestamp }));
}

// Minimal DOM/window doubles that record the calls the module makes.
function createEnv({
  cookie = '',
  hostname = 'go.metix.ai',
  pathname = '/',
  readyState = 'complete',
  clarity = null,
  fetchImpl,
  localStore = new Map(),
  sessionStore = new Map(),
  sessionStorageThrows = false,
  metixConfig,
} = {}) {
  const listeners = [];
  const fetchCalls = [];
  const intervals = [];

  const defaultFetch = () =>
    Promise.resolve({ status: 200, json: () => Promise.resolve({ code: 0 }) });

  const document = {
    readyState,
    cookie,
    visibilityState: 'visible',
    addEventListener(type, handler) {
      listeners.push({ target: 'document', type, handler });
    },
    removeEventListener() {},
  };

  const window = {
    location: { hostname, pathname, origin: `https://${hostname}`, href: `https://${hostname}${pathname}` },
    sessionStorage: {
      getItem: (k) => {
        if (sessionStorageThrows) throw new Error('sessionStorage blocked');
        return sessionStore.has(k) ? sessionStore.get(k) : null;
      },
      setItem: (k, v) => {
        if (sessionStorageThrows) throw new Error('sessionStorage blocked');
        sessionStore.set(k, String(v));
      },
    },
    localStorage: {
      getItem: (k) => (localStore.has(k) ? localStore.get(k) : null),
      setItem: (k, v) => localStore.set(k, String(v)),
    },
    fetch(url, options) {
      fetchCalls.push({ url, options });
      return (fetchImpl || defaultFetch)(url, options);
    },
    setInterval(fn, ms) {
      intervals.push({ fn, ms });
      return intervals.length; // fake id
    },
    clearInterval(id) {
      intervals.cleared = id;
    },
    addEventListener(type, handler) {
      listeners.push({ target: 'window', type, handler });
    },
    removeEventListener() {},
    dispatchEvent(event) { dispatch('window', event.type, event); },
  };
  if (clarity) window.clarity = clarity;
  if (metixConfig) window.metix = { config: metixConfig };
  window.document = document;

  const dispatch = (target, type, event) => {
    listeners
      .filter((l) => l.target === target && l.type === type)
      .forEach((l) => l.handler(event));
  };

  return { window, document, fetchCalls, intervals, dispatch, listeners };
}

function createClarity() {
  const calls = [];
  const fn = (...args) => calls.push(args);
  fn.calls = calls;
  fn.events = () => calls.filter((c) => c[0] === 'event').map((c) => c[1]);
  fn.tags = () =>
    calls
      .filter((c) => c[0] === 'set')
      .reduce((acc, [, k, v]) => {
        acc[k] = v;
        return acc;
      }, {});
  return fn;
}

async function run(envOptions = {}) {
  const env = createEnv(envOptions);
  const source = await readFile(scriptPath, 'utf8');
  const math = Object.create(Math);
  if (typeof envOptions.random === 'function') math.random = envOptions.random;
  const context = {
    window: env.window,
    document: env.document,
    URL,
    Event,
    JSON,
    Object,
    Math: math,
    Number,
    String,
    Date,
    Promise,
    decodeURIComponent,
    encodeURIComponent,
  };
  vm.runInNewContext(source, context, { filename: 'metix-track.js' });
  return env;
}

function lastBatch(fetchCalls) {
  const call = fetchCalls.filter((c) => c.url === BATCH_URL).at(-1);
  assert.ok(call, 'a batch request should have been sent');
  return { call, payload: JSON.parse(call.options.body) };
}

test('exposes the tracker surface + ported enums and queues a page_view on init', async () => {
  const { window } = await run({ pathname: '/improve' });

  assert.equal(typeof window.metix.track, 'function');
  assert.equal(typeof window.metix.tracker.flush, 'function');
  assert.equal(window.metix.EventType.click, 'click');
  assert.equal(window.metix.PageId.improve, 'go-rank-improve');
  // page_view is queued (batch size 5), not yet flushed.
  assert.equal(window.metix.tracker.queue.length, 1);
  assert.equal(window.metix.tracker.queue[0].eventType, 'page_view');
});

test('keeps configurable businessId aligned with the eventId prefix', async () => {
  const { window } = await run({ metixConfig: { businessId: 'campaign-site' } });
  const pageView = window.metix.tracker.queue[0];
  assert.equal(pageView.businessId, 'campaign-site');
  assert.equal(pageView.eventId, 'campaign-site.go-rank-root.page.page_view');
});

test('adds a persistent visitor_id while keeping session_id session-scoped', async () => {
  const localStore = new Map();
  const first = await run({ localStore });
  const firstPageView = first.window.metix.tracker.queue[0];
  assert.match(firstPageView.properties.visitor_id, /^v_/);
  assert.match(firstPageView.sessionId, /^s_/);

  const second = await run({ localStore });
  const secondPageView = second.window.metix.tracker.queue[0];
  assert.equal(secondPageView.properties.visitor_id, firstPageView.properties.visitor_id);
  assert.notEqual(secondPageView.sessionId, firstPageView.sessionId);
});

test('marks a recoverable cookie session logged in without an access token', async () => {
  const user = encodeURIComponent(JSON.stringify({ userUuid: 'user-123' }));
  const { window } = await run({
    cookie: `${AUTH_USER_COOKIE}=${user}; ${AUTH_REFRESH_COOKIE}=refresh-123`,
  });
  assert.equal(window.metix.tracker.queue[0].properties.is_logged_in, 'true');
});

test('an unsampled session enqueues nothing and never touches Clarity', async () => {
  const clarity = createClarity();
  const { window, fetchCalls } = await run({
    clarity,
    metixConfig: { sampleRate: 0 },
  });
  window.metix.track('cta_click');
  await window.metix.tracker.flush();

  assert.equal(window.metix.tracker.queue.length, 0);
  assert.equal(fetchCalls.length, 0);
  assert.equal(clarity.calls.length, 0); // Clarity is never a sink for track()
});

test('persists a sampling decision across full-page loads in one session', async () => {
  const sessionStore = new Map();
  const first = await run({
    sessionStore,
    metixConfig: { sampleRate: 0.5 },
    random: () => 0.1,
  });
  const second = await run({
    sessionStore,
    metixConfig: { sampleRate: 0.5 },
    random: () => 0.9,
  });

  assert.equal(first.window.metix.tracker.isSampled, true);
  assert.equal(second.window.metix.tracker.isSampled, true);
  assert.equal(second.window.metix.tracker.queue[0].eventType, 'page_view');
});

test('uses a stable visitor-based sampling fallback when sessionStorage is blocked', async () => {
  const localStore = new Map();
  const first = await run({
    localStore,
    sessionStorageThrows: true,
    metixConfig: { sampleRate: 0.5 },
    random: () => 0.1,
  });
  const second = await run({
    localStore,
    sessionStorageThrows: true,
    metixConfig: { sampleRate: 0.5 },
    random: () => 0.9,
  });

  assert.equal(first.window.metix.tracker.isSampled, second.window.metix.tracker.isSampled);
});

test('flush() POSTs the queue as a batch with businessId + timestamp + eventId', async () => {
  const { window, fetchCalls } = await run({ pathname: '/improve' });
  window.metix.track('cta_click', { location: 'hero' });

  await window.metix.tracker.flush();

  const { call, payload } = lastBatch(fetchCalls);
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.headers['Content-Type'], 'application/json');
  assert.ok(Array.isArray(payload.batchTrackEventList));
  assert.equal(payload.batchTrackEventList.length, 2); // page_view + cta_click

  const cta = payload.batchTrackEventList.find((e) => e.eventId.endsWith('.cta_click'));
  assert.equal(cta.businessId, 'homepage');
  assert.equal(cta.eventId, 'homepage.go-rank-improve.page.cta_click');
  assert.equal(typeof cta.timestamp, 'number');
  assert.equal(cta.properties.location, 'hero');
  assert.equal(cta.properties.path, '/improve');
  // queue is drained after a successful flush
  assert.equal(window.metix.tracker.queue.length, 0);
});

test('custom properties cannot spoof automatic dimensions or exceed the event cap', async () => {
  const { window } = await run({ pathname: '/improve' });
  const custom = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`custom_${index}`, index]),
  );
  window.metix.track('cta_click', {
    ...custom,
    path: '/spoofed',
    visitor_id: 'spoofed',
    is_logged_in: 'true',
    utm_source: 'spoofed',
  });

  const event = window.metix.tracker.queue.find((item) => item.eventId.endsWith('.cta_click'));
  assert.equal(event.properties.path, '/improve');
  assert.notEqual(event.properties.visitor_id, 'spoofed');
  assert.equal(event.properties.is_logged_in, 'false');
  assert.equal(event.properties.utm_source, 'direct');
  assert.ok(Object.keys(event.properties).length <= 24);
});

test('object-form events cannot spoof event, page, user, or session identity', async () => {
  const { window } = await run({ pathname: '/result' });
  window.metix.track({
    eventType: 'success',
    name: 'demo_complete',
    eventId: 'spoofed.event',
    pageId: 'spoofed-page',
    positionId: 'spoofed-position',
    userId: 'spoofed-user',
    sessionId: 'spoofed-session',
  });

  const event = window.metix.tracker.queue.find((item) =>
    item.eventId.endsWith('.demo_complete'),
  );
  assert.equal(event.eventId, 'homepage.go-rank-result.page.demo_complete');
  assert.equal(event.pageId, 'go-rank-result');
  assert.equal(event.positionId, 'page');
  assert.notEqual(event.sessionId, 'spoofed-session');
  assert.equal(event.userId, undefined);
});

for (const scene of ['root', 'result', 'share', 'improve', 'opportunities']) {
  test(`campaign ${scene} gets an explicit page ID without exposing handles`, async () => {
    const pathname = scene === 'root' ? '/' : `/${scene}/private-person`;
    const { window } = await run({ pathname });
    const page = window.metix.tracker.queue[0];
    assert.equal(page.pageId, `go-rank-${scene}`);
    assert.equal(page.properties.path, scene === 'root' ? '/' : `/${scene}/:handle`);
    assert.equal(page.properties.campaign, 'rank');
    assert.equal(JSON.stringify(page).includes('private-person'), false);
  });
}

test('auto-flushes once the queue reaches maxBatchSize', async () => {
  const { window, fetchCalls } = await run();
  // init already queued page_view (1); add up to the batch size of 5.
  for (let i = 0; i < 4; i += 1) window.metix.track('click', { i });

  const batches = fetchCalls.filter((c) => c.url === BATCH_URL);
  assert.equal(batches.length, 1);
  assert.equal(JSON.parse(batches[0].options.body).batchTrackEventList.length, 5);
});

test('never reaches the network off track-enabled hosts', async () => {
  const { window, fetchCalls } = await run({ hostname: 'localhost' });
  window.metix.track('cta_click');
  await window.metix.tracker.flush();

  assert.equal(fetchCalls.length, 0);
});

test('keeps former QA host silent', async () => {
  const { window, fetchCalls } = await run({ hostname: 'www-dev.metix.ai' });
  window.metix.track('cta_click');
  await window.metix.tracker.flush();

  assert.equal(fetchCalls.length, 0);
});

test('attaches a Bearer token from the auth cookie when present', async () => {
  const { window, fetchCalls } = await run({
    cookie: `${AUTH_COOKIE}=tok-123`,
  });
  window.metix.track('cta_click');
  await window.metix.tracker.flush();

  const { call } = lastBatch(fetchCalls);
  assert.equal(call.options.headers.Authorization, 'Bearer tok-123');
  assert.equal(call.options.credentials, 'same-origin');
});

test('a forced flush uses keepalive but keeps the interval timer alive', async () => {
  const { window, fetchCalls, intervals } = await run();
  window.metix.track('cta_click');
  await window.metix.tracker.flush(true);

  const { call } = lastBatch(fetchCalls);
  assert.equal(call.options.keepalive, true);
  // A page-hide (tab switch) must not permanently disable periodic flushing.
  assert.notEqual(window.metix.tracker.timer, null);
  assert.equal(intervals.cleared, undefined);
});

test('data-tracking lookalike attributes are not misread as props', async () => {
  const clarity = createClarity();
  const env = await run({ clarity });

  const el = {
    getAttribute: (n) => (n === 'data-track' ? 'nav_demo' : null),
    dataset: { track: 'nav_demo', tracking: 'ga-legacy', trackLabel: 'demo' },
  };
  env.dispatch('document', 'click', {
    target: { closest: (sel) => (sel === '[data-track]' ? el : null) },
  });

  const sent = env.window.metix.tracker.queue.find((e) => e.eventId.endsWith('.nav_demo'));
  assert.ok(sent);
  assert.equal(sent.properties.label, 'demo');
  assert.equal('ing' in sent.properties, false);
  assert.equal('tracking' in sent.properties, false);
});

test('page hide triggers a forced flush', async () => {
  const env = await run();
  env.window.metix.track('cta_click');
  env.document.visibilityState = 'hidden';
  env.dispatch('document', 'visibilitychange', {});

  assert.ok(env.fetchCalls.some((c) => c.url === BATCH_URL));
});

test('a concurrent flush is skipped instead of double-sending', async () => {
  const { window, fetchCalls } = await run();
  window.metix.tracker.isFlushing = true;
  window.metix.track('cta_click');

  await window.metix.tracker.flush();
  assert.equal(fetchCalls.filter((c) => c.url === BATCH_URL).length, 0);
  // the queue is preserved for the next scheduled/manual flush
  assert.ok(window.metix.tracker.queue.length >= 1);
});

test('a forced conversion flush sends events queued behind an in-flight batch', async () => {
  const { window, fetchCalls } = await run();
  window.metix.tracker.queue = [];
  window.metix.tracker.isFlushing = true;
  window.metix.track('signup', { location: 'hero' });

  await window.metix.tracker.flush(true);
  const { call, payload } = lastBatch(fetchCalls);
  assert.equal(call.options.keepalive, true);
  assert.equal(payload.batchTrackEventList.length, 1);
  assert.ok(payload.batchTrackEventList[0].eventId.endsWith('.signup'));
  assert.equal(window.metix.tracker.queue.length, 0);
});

test('a failed batch is dropped rather than re-queued', async () => {
  const { window, fetchCalls } = await run({
    fetchImpl: () => Promise.reject(new Error('network down')),
  });
  window.metix.track('cta_click');
  await window.metix.tracker.flush();

  assert.ok(fetchCalls.some((c) => c.url === BATCH_URL));
  assert.equal(window.metix.tracker.queue.length, 0);
});

test('does NOT forward events to Clarity (backend is the only sink)', async () => {
  const clarity = createClarity();
  const { window, fetchCalls } = await run({ clarity, pathname: '/improve' });
  window.metix.track('cta_click', { location: 'hero' });
  await window.metix.tracker.flush();

  // The backend still receives the event…
  const { payload } = lastBatch(fetchCalls);
  assert.ok(payload.batchTrackEventList.some((e) => e.eventId.endsWith('.cta_click')));
  // …but Clarity is never called, so its event/tag cardinality stays untouched.
  assert.equal(clarity.calls.length, 0);
});

test('sends moduleId as a top-level field (not in eventId, not in properties)', async () => {
  const { window, fetchCalls } = await run({ pathname: '/result' });
  window.metix.track({
    eventType: 'start',
    name: 'demo_start',
    moduleId: 'upload-resume',
    properties: { role: 'backend' },
  });
  await window.metix.tracker.flush();

  const { payload } = lastBatch(fetchCalls);
  const evt = payload.batchTrackEventList.find((e) => e.eventId.endsWith('.demo_start'));
  assert.equal(evt.moduleId, 'upload-resume');
  assert.equal(evt.eventId, 'homepage.go-rank-result.page.demo_start');
  assert.equal(evt.properties.module_id, undefined);
});

test('merges marketing attribution onto every event', async () => {
  const { window, fetchCalls } = await run({
    cookie: `${ATTRIBUTION_COOKIE}=${encodeAttribution({
      utm_source: 'linkedin',
      utm_campaign: 'spring',
    })}`,
  });
  window.metix.track('cta_click');
  await window.metix.tracker.flush();

  const { payload } = lastBatch(fetchCalls);
  const cta = payload.batchTrackEventList.find((e) => e.eventId.endsWith('.cta_click'));
  assert.equal(cta.properties.utm_source, 'linkedin');
  assert.equal(cta.properties.utm_campaign, 'spring');
});

test('falls back to direct if an expired attribution cookie remains readable', async () => {
  const expiredAt = Date.now() - 15 * 24 * 60 * 60 * 1000;
  const { window } = await run({
    cookie: `${ATTRIBUTION_COOKIE}=${encodeAttribution(
      { utm_source: 'linkedin' },
      expiredAt,
    )}`,
  });

  assert.equal(window.metix.tracker.queue[0].properties.utm_source, 'direct');
});

test('data-track elements emit a click event with data-track-* props', async () => {
  const env = await run();

  const el = {
    getAttribute: (n) => (n === 'data-track' ? 'nav_demo' : null),
    dataset: {
      track: 'nav_demo',
      trackLocation: 'nav',
      trackBillingPeriod: 'yearly',
    },
  };
  env.dispatch('document', 'click', {
    target: { closest: (sel) => (sel === '[data-track]' ? el : null) },
  });

  const sent = env.window.metix.tracker.queue.find((e) => e.eventId.endsWith('.nav_demo'));
  assert.ok(sent);
  assert.equal(sent.eventType, 'click');
  assert.equal(sent.properties.location, 'nav');
  assert.equal(sent.properties.billing_period, 'yearly');
  assert.equal(sent.properties.billingPeriod, undefined);
});

test('signup clicks infer the resolved target and flush immediately with keepalive', async () => {
  const env = await run();
  // Put four events in the queue so signup itself reaches maxBatchSize. The
  // conversion must still own the flush and send that batch with keepalive.
  for (let i = 0; i < 3; i += 1) env.window.metix.track('pre_signup', { i });
  const el = {
    getAttribute: (name) => {
      if (name === 'data-track') return 'signup';
      if (name === 'href') return '/hire';
      return null;
    },
    dataset: { track: 'signup', trackLocation: 'hero' },
  };
  env.dispatch('document', 'click', {
    target: { closest: (selector) => (selector === '[data-track]' ? el : null) },
  });
  await Promise.resolve();

  const { call, payload } = lastBatch(env.fetchCalls);
  assert.equal(call.options.keepalive, true);
  assert.equal(env.fetchCalls.filter((entry) => entry.url === BATCH_URL).length, 1);
  const signup = payload.batchTrackEventList.find((event) => event.eventId.endsWith('.signup'));
  assert.equal(signup.properties.location, 'hero');
  assert.equal(signup.properties.target, '/:unknown');
});

test('never throws when Clarity or cookies misbehave', async () => {
  const clarity = () => {
    throw new Error('clarity blew up');
  };
  clarity.calls = [];
  const env = createEnv();
  Object.defineProperty(env.document, 'cookie', {
    get() {
      throw new Error('cookies blocked');
    },
  });
  env.window.clarity = clarity;

  const source = await readFile(scriptPath, 'utf8');
  const context = {
    window: env.window,
    document: env.document,
    URL,
    Event,
    JSON,
    Object,
    Math,
    Number,
    String,
    Date,
    Promise,
    decodeURIComponent,
    encodeURIComponent,
  };

  assert.doesNotThrow(() =>
    vm.runInNewContext(source, context, { filename: 'metix-track.js' }),
  );
  assert.doesNotThrow(() => env.window.metix.track('cta_click'));
});

test('auto-tracks a cross-origin link (no data-track) as an outbound click', async () => {
  const env = await run({ hostname: 'go.metix.ai' });
  const anchor = {
    protocol: 'https:',
    hostname: 'x.com',
    href: 'https://x.com/metix_ai',
    closest(sel) {
      if (sel === '[data-track]') return null; // not instrumented → falls through
      if (sel === 'a[href]') return anchor;
      return null;
    },
  };
  env.dispatch('document', 'click', { target: anchor });

  const sent = env.window.metix.tracker.queue.find((e) => e.eventId.endsWith('.outbound'));
  assert.ok(sent, 'an outbound event should be queued');
  assert.equal(sent.eventType, 'click');
  assert.equal(sent.properties.target, 'https://x.com');
});

test('does NOT auto-track same-origin links, mailto, or data-track links as outbound', async () => {
  const env = await run({ hostname: 'go.metix.ai' });
  const internal = { protocol: 'https:', hostname: 'go.metix.ai', href: 'https://metix.ai/pricing',
    closest: (sel) => (sel === 'a[href]' ? internal : null) };
  const wwwInternal = { protocol: 'https:', hostname: 'www.metix.ai', href: 'https://www.metix.ai/about',
    closest: (sel) => (sel === 'a[href]' ? wwwInternal : null) };
  const mail = { protocol: 'mailto:', hostname: '', href: 'mailto:contact@metix.ai',
    closest: (sel) => (sel === 'a[href]' ? mail : null) };
  env.dispatch('document', 'click', { target: internal });
  env.dispatch('document', 'click', { target: wwwInternal });
  env.dispatch('document', 'click', { target: mail });

  const outbound = env.window.metix.tracker.queue.filter((e) => e.eventId.endsWith('.outbound'));
  assert.equal(outbound.length, 0);
});

test('personal title, route, referrer and target never reach the upload payload', async () => {
  const env = createEnv({ pathname: '/share/private-person' });
  env.document.title = 'Private Person — Top 1%';
  env.document.referrer = 'https://linkedin.com/in/private-person?email=secret@example.com';
  vm.runInNewContext(await readFile(scriptPath, 'utf8'), { window: env.window, document: env.document, URL, Event });
  env.window.metix.track('cta_click', { target: 'https://linkedin.com/in/private-person?secret=yes' });
  await env.window.metix.tracker.flush();
  const { payload } = lastBatch(env.fetchCalls);
  const page = payload.batchTrackEventList[0];
  assert.equal(page.properties.page_title, 'Metix Rank — share');
  assert.equal(page.properties.referrer, 'https://linkedin.com');
  assert.equal(payload.batchTrackEventList[1].properties.target, 'https://linkedin.com');
  assert.doesNotMatch(JSON.stringify(payload), /private-person|Private Person|secret@example/);
});

test('initial view dedupes React startup and records subsequent scene transitions', async () => {
  const { window, fetchCalls } = await run();
  window.metix.track('page_view', { scene: 'root' });
  window.metix.track('page_view', { scene: 'result' });
  window.metix.track('page_view', { scene: 'result' });
  window.metix.track('page_view', { scene: 'improve' });
  window.metix.track('page_view', { scene: 'root' });
  await window.metix.tracker.flush();
  const { payload } = lastBatch(fetchCalls);
  assert.deepEqual(payload.batchTrackEventList.map(e => e.pageId), ['go-rank-root', 'go-rank-result', 'go-rank-improve', 'go-rank-root']);
});

for (const hostname of ['localhost', '127.0.0.1', 'preview.example.com', 'metix.ai']) {
  test(`${hostname} suppresses every collection endpoint`, async () => {
    const { window, fetchCalls } = await run({ hostname });
    window.metix.track('lookup_submit');
    window.metix.tracker.trackOnce({ eventType: 'custom' });
    window.metix.tracker.trackOnceAnonymous({ eventType: 'custom' });
    await window.metix.tracker.flush();
    assert.equal(fetchCalls.length, 0);
  });
}

test('all collection requests suppress the personal route in the HTTP Referer header', async () => {
  const { window, fetchCalls } = await run({ pathname: '/share/private-person' });
  window.metix.tracker.trackOnce({ eventType: 'custom' });
  window.metix.tracker.trackOnceAnonymous({ eventType: 'custom' });
  await window.metix.tracker.flush();

  assert.equal(fetchCalls.length, 3);
  for (const call of fetchCalls) {
    assert.equal(call.options.referrerPolicy, 'no-referrer', call.url);
  }
});

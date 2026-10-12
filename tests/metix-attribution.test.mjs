import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../src/scripts/metix-attribution.js', import.meta.url), 'utf8');
function storedData(state) {
  return JSON.parse(decodeURIComponent(state.cookie.split('=').slice(1).join('='))).data;
}
function run(search, hrefs, saved) {
  let cookie = saved ? `metix_attribution=${encodeURIComponent(JSON.stringify(saved))}` : '';
  const links = hrefs.map(href => ({
    href,
    getAttribute() { return this.href; },
    setAttribute(_, value) { this.href = value; },
  }));
  let observer;
  const document = {
    baseURI: 'https://go.metix.ai/recruiters-view/',
    documentElement: {},
    querySelectorAll: () => links,
    get cookie() { return cookie; },
    set cookie(value) { cookie = value.split(';')[0]; },
  };
  vm.runInNewContext(script, {
    window: { location: { search, protocol: 'https:', hostname: 'go.metix.ai' } },
    document, URL, URLSearchParams,
    MutationObserver: class { constructor(fn) { observer = fn; } observe() {} },
  });
  return { links, update: () => observer?.(), cookie };
}

test('forwards attribution while preserving destination parameters and fragments', () => {
  const { links } = run('?utm_source=linkedin&utm_campaign=fall&gclid=abc', [
    'https://metix.ai/signup?plan=pro#form',
    'https://www.metix.ai/?utm_source=email',
    'https://metix.ai.evil.example/',
    'https://other.example/',
  ]);
  const url = new URL(links[0].href);
  assert.equal(url.searchParams.get('utm_source'), 'linkedin');
  assert.equal(url.searchParams.get('utm_campaign'), 'fall');
  assert.equal(url.searchParams.get('gclid'), 'abc');
  assert.equal(url.searchParams.get('plan'), 'pro');
  assert.equal(url.hash, '#form');
  assert.equal(new URL(links[1].href).searchParams.get('utm_source'), 'email');
  assert.equal(links[2].href, 'https://metix.ai.evil.example/');
  assert.equal(links[3].href, 'https://other.example/');
});

test('uses stored attribution for dynamically added links', () => {
  const state = run('', [], { version: 1, timestamp: Date.now(), data: { utm_source: 'newsletter' } });
  state.links.push({ href: 'https://metix.ai/signup', getAttribute() { return this.href; }, setAttribute(_, value) { this.href = value; } });
  state.update();
  assert.equal(new URL(state.links[0].href).searchParams.get('utm_source'), 'newsletter');
});

test('legal links stay clean while signup links still receive attribution', () => {
  const hrefs = [
    'https://metix.ai/terms-of-service',
    'https://metix.ai/privacy-policy',
    'https://www.metix.ai/privacy-policy/?lang=en#cookies',
    'https://metix.ai/hire/signup',
  ];
  const { links } = run('?src=linkedin&utm_campaign=social&gclid=click', hrefs);
  assert.deepEqual(links.slice(0, 3).map(link => link.href), hrefs.slice(0, 3));
  assert.equal(new URL(links[3].href).searchParams.get('utm_source'), 'linkedin');
});

test('expired attribution falls back to direct and malformed links do not block others', () => {
  const { links } = run('', ['http://[', 'https://metix.ai/'], {
    version: 1, timestamp: Date.now() - 15 * 86400000, data: { utm_source: 'old' },
  });
  assert.equal(new URL(links[1].href).searchParams.get('utm_source'), 'direct');
});

test('src is stored and forwarded as canonical utm_source, replacing the previous touch', () => {
  const state = run('?src=%20linkedin%20&utm_campaign=social', ['https://metix.ai/hire/signup'], {
    version: 1, timestamp: Date.now(), data: { utm_source: 'google', gclid: 'old' },
  });
  assert.deepEqual(storedData(state), { src: 'linkedin', utm_source: 'linkedin', utm_campaign: 'social' });
  const params = new URL(state.links[0].href).searchParams;
  assert.equal(params.get('utm_source'), 'linkedin');
  assert.equal(params.has('src'), false);
  assert.equal(params.has('gclid'), false);
});

test('events retain src from the saved touch across pages and callers cannot override it', () => {
  const state = run('?src=linkedin', []);
  const window = {
    location: { search: '', pathname: '/recruiters-view/', hostname: 'localhost' },
    setInterval: () => 1, addEventListener() {}, dispatchEvent() {},
  };
  const document = {
    cookie: state.cookie, readyState: 'complete', referrer: '',
    addEventListener() {}, querySelectorAll: () => [],
  };
  vm.runInNewContext(readFileSync(new URL('../src/scripts/metix-track.js', import.meta.url), 'utf8'), {
    window, document, URL, URLSearchParams,
  });
  assert.equal(window.metix.ready, true);
  assert.equal(window.metix.tracker.queue[0].properties.src, 'linkedin');
  assert.equal(window.metix.tracker.queue[0].properties.utm_source, 'linkedin');
  window.metix.track('share', { src: 'spoofed' });
  assert.equal(window.metix.tracker.queue.at(-1).properties.src, 'linkedin');
});

test('nonempty utm_source takes precedence over src; blank utm_source uses src', () => {
  assert.deepEqual(storedData(run('?utm_source=email&src=linkedin', [])), { utm_source: 'email', src: 'linkedin' });
  assert.equal(storedData(run('?utm_source=%20&src=linkedin', [])).utm_source, 'linkedin');
  assert.equal(storedData(run('?utm_source=email', [])).src, undefined);
  const saved = { version: 1, timestamp: Date.now(), data: { src: 'linkedin', utm_source: 'linkedin' } };
  assert.equal(storedData(run('?utm_source=email', [], saved)).src, undefined);
});

test('src follows source normalization and empty src preserves existing attribution', () => {
  assert.equal(storedData(run(`?src=${'x'.repeat(300)}`, [])).utm_source.length, 255);
  const saved = { version: 1, timestamp: Date.now(), data: { utm_source: 'newsletter' } };
  assert.deepEqual(storedData(run('?src=%20', [], saved)), saved.data);
  assert.equal(storedData(run('?src=', [])).utm_source, 'direct');
});

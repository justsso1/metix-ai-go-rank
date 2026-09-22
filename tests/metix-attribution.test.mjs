import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const scriptPath = new URL('../src/scripts/metix-attribution.js', import.meta.url);
const COOKIE_NAME = 'metix_attribution';
const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 6, 24, 12, 0, 0);

function createCookieDocument(initialCookies = {}) {
  const values = new Map(Object.entries(initialCookies));
  const assignments = [];

  return {
    assignments,
    get cookie() {
      return Array.from(values, ([name, value]) => `${name}=${value}`).join('; ');
    },
    set cookie(serialized) {
      assignments.push(serialized);
      const [pair] = serialized.split(';');
      const separator = pair.indexOf('=');
      values.set(pair.slice(0, separator), pair.slice(separator + 1));
    },
  };
}

function encodeStored(data, timestamp = NOW, version = 1) {
  return encodeURIComponent(JSON.stringify({ version, data, timestamp }));
}

function decodeAssignment(assignment) {
  const [pair] = assignment.split(';');
  const value = pair.slice(pair.indexOf('=') + 1);
  return JSON.parse(decodeURIComponent(value));
}

async function readAttributionSource() {
  try {
    return await readFile(scriptPath, 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') return '';
    throw error;
  }
}

async function runAttribution({
  search = '',
  hostname = 'go.metix.ai',
  protocol = 'https:',
  now = NOW,
  initialCookies = {},
  document = createCookieDocument(initialCookies),
} = {}) {
  const source = await readAttributionSource();

  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }

    static now() {
      return now;
    }
  }

  const window = {
    location: { search, hostname, protocol },
  };
  const context = {
    Date: FakeDate,
    JSON,
    Object,
    URLSearchParams,
    decodeURIComponent,
    encodeURIComponent,
    document,
    window,
  };

  Object.defineProperty(context, 'localStorage', {
    get() {
      throw new Error('localStorage must not be accessed');
    },
  });
  Object.defineProperty(context, 'sessionStorage', {
    get() {
      throw new Error('sessionStorage must not be accessed');
    },
  });

  window.document = document;
  vm.runInNewContext(source, context, { filename: 'metix-attribution.js' });
  return document;
}

test('captures supported UTM parameters in a versioned 14-day cookie', async () => {
  const document = await runAttribution({
    search:
      '?utm_source=linkedin&utm_medium=paid_social&utm_campaign=spring&li_campaign_id=42&ignored=x',
  });

  assert.equal(document.assignments.length, 1);
  const assignment = document.assignments[0];
  assert.match(assignment, /^metix_attribution=/);
  assert.match(assignment, /Max-Age=1209600/);
  assert.match(assignment, /Expires=/);
  assert.match(assignment, /Path=\//);
  assert.match(assignment, /SameSite=Lax/);
  assert.match(assignment, /Secure/);
  assert.match(assignment, /Domain=metix\.ai/);
  assert.deepEqual(decodeAssignment(assignment), {
    version: 1,
    data: {
      utm_source: 'linkedin',
      utm_medium: 'paid_social',
      utm_campaign: 'spring',
      li_campaign_id: '42',
    },
    timestamp: NOW,
  });
});

test('captures paid-click ids used by Google, Meta, and Microsoft ads', async () => {
  const document = await runAttribution({
    search: '?gclid=ABC&fbclid=xyz&msclkid=m1&gbraid=gb&wbraid=wb&gad_source=1&gad_campaignid=99&gclsrc=aw.ds',
  });
  assert.deepEqual(decodeAssignment(document.assignments[0]).data, {
    gclid: 'ABC',
    fbclid: 'xyz',
    msclkid: 'm1',
    gbraid: 'gb',
    wbraid: 'wb',
    gad_source: '1',
    gad_campaignid: '99',
    gclsrc: 'aw.ds',
  });
});

test('a tagged visit replaces rather than merges previous attribution', async () => {
  const document = await runAttribution({
    search: '?utm_source=google',
    initialCookies: {
      [COOKIE_NAME]: encodeStored({
        utm_source: 'linkedin',
        utm_campaign: 'old-campaign',
      }),
    },
  });

  assert.deepEqual(decodeAssignment(document.assignments[0]).data, {
    utm_source: 'google',
  });
});

test('an untagged visit preserves valid attribution without refreshing it', async () => {
  const original = encodeStored(
    { utm_source: 'linkedin', utm_campaign: 'spring' },
    NOW - 5 * DAY_MS,
  );
  const document = await runAttribution({
    initialCookies: { [COOKIE_NAME]: original },
  });

  assert.deepEqual(document.assignments, []);
  assert.match(document.cookie, new RegExp(`${COOKIE_NAME}=${original}`));
});

test('an untagged visit rewrites non-canonical attribution without refreshing it', async () => {
  const timestamp = NOW - 5 * DAY_MS;
  const document = await runAttribution({
    initialCookies: {
      [COOKIE_NAME]: encodeStored(
        {
          utm_source: ' linkedin ',
          utm_content: 'x'.repeat(300),
          utm_medium: 42,
          injected: 'value',
        },
        timestamp,
      ),
    },
  });

  assert.equal(document.assignments.length, 1);
  const assignment = document.assignments[0];
  assert.match(assignment, /Max-Age=777600/);
  assert.match(
    assignment,
    new RegExp(`Expires=${new Date(timestamp + 14 * DAY_MS).toUTCString()}`),
  );
  assert.deepEqual(decodeAssignment(assignment), {
    version: 1,
    data: {
      utm_source: 'linkedin',
      utm_content: 'x'.repeat(255),
    },
    timestamp,
  });
});

for (const [name, cookie] of [
  ['missing', undefined],
  ['malformed', '%7Bbad-json'],
  ['expired', encodeStored({ utm_source: 'linkedin' }, NOW - 14 * DAY_MS)],
  ['future', encodeStored({ utm_source: 'linkedin' }, NOW + 1)],
  ['wrong-version', encodeStored({ utm_source: 'linkedin' }, NOW, 2)],
  ['empty', encodeStored({ ignored: 'value' })],
]) {
  test(`${name} attribution falls back to direct`, async () => {
    const initialCookies = cookie ? { [COOKIE_NAME]: cookie } : {};
    const document = await runAttribution({ initialCookies });

    assert.equal(document.assignments.length, 1);
    assert.deepEqual(decodeAssignment(document.assignments[0]).data, {
      utm_source: 'direct',
    });
  });
}

test('trims values, ignores empty values, and caps values at 255 characters', async () => {
  const document = await runAttribution({
    search: `?utm_source=%20linkedin%20&utm_medium=%20%20&utm_content=${'x'.repeat(300)}`,
  });
  const stored = decodeAssignment(document.assignments[0]);

  assert.equal(stored.data.utm_source, 'linkedin');
  assert.equal(stored.data.utm_content.length, 255);
  assert.equal('utm_medium' in stored.data, false);
});

test('uses the parent domain on the campaign production host', async () => {
  for (const hostname of ['go.metix.ai']) {
    const document = await runAttribution({
      hostname,
      search: '?utm_source=qa',
    });
    assert.match(document.assignments[0], /Domain=metix\.ai/);
  }
});

test('omits Domain outside production and omits Secure over HTTP', async () => {
  const document = await runAttribution({
    hostname: 'localhost',
    protocol: 'http:',
    search: '?utm_source=qa',
  });

  assert.doesNotMatch(document.assignments[0], /Domain=/);
  assert.doesNotMatch(document.assignments[0], /;\s*Secure/);
});

test('cookie access failures never escape the attribution module', async () => {
  const document = {};
  Object.defineProperty(document, 'cookie', {
    get() {
      throw new Error('cookies blocked');
    },
    set() {
      throw new Error('cookies blocked');
    },
  });

  await assert.doesNotReject(
    runAttribution({
      search: '?utm_source=qa',
      document,
    }),
  );
});


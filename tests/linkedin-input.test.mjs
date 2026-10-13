import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const sourceDirectory = fileURLToPath(new URL('../src/recruiters-view/', import.meta.url));

function modules(globals = {}) {
  const context = vm.createContext({ URL, URLSearchParams, setTimeout, clearTimeout, DOMException, ...globals });
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    }).outputText;
    const require = specifier => {
      assert.ok(specifier.startsWith('.'), `Unexpected dependency: ${specifier}`);
      const target = resolve(dirname(path), specifier);
      return load(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`);
    };
    vm.runInContext(`(function(require, module, exports) {${code}\n})`, context, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  return name => load(resolve(sourceDirectory, name));
}

const { parseLinkedInInput } = modules()('mock.ts');
const suppliedHandle = '🕹️-amandine-picard-248809a5';
const suppliedUrl = `https://www.linkedin.com/in/${suppliedHandle}`;
const encodedUrl = `https://www.linkedin.com/in/${encodeURIComponent(suppliedHandle)}`;

test('raw and percent-encoded emoji profile URLs normalize identically without double encoding', () => {
  for (const raw of [suppliedUrl, encodedUrl, `${suppliedUrl}/?trk=public_profile#about`]) {
    const parsed = parseLinkedInInput(raw);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.handle, suppliedHandle);
    assert.equal(parsed.url, encodedUrl);
    assert.equal(parseLinkedInInput(parsed.url).url, encodedUrl);
  }
});

test('emoji sequences, skin tones, flags and Unicode combining marks are preserved', () => {
  for (const handle of ['👩‍💻-engineer', '👩🏽‍💻-engineer', '🇫🇷-consultant', '1️⃣-creator', 'e\u0301lodie-陈']) {
    const parsed = parseLinkedInInput(`linkedin.com/in/${handle}`);
    assert.equal(parsed.ok, true, handle);
    assert.equal(parsed.handle, handle);
    assert.equal(parsed.url, `https://www.linkedin.com/in/${encodeURIComponent(handle)}`);
  }
});

test('ordinary profile URLs keep their existing normalization', () => {
  for (const raw of [
    '  linkedin.com/in/Example-Name_123  ',
    'https://WWW.LINKEDIN.COM/in/Example-Name_123/',
    'http://fr.linkedin.com/in/Example-Name_123?trk=public_profile',
  ]) {
    const parsed = parseLinkedInInput(raw);
    assert.equal(parsed.ok, true);
    assert.equal(parsed.handle, 'example-name_123');
    assert.equal(parsed.url, 'https://www.linkedin.com/in/example-name_123');
  }
});

test('foreign domains, credentials, extra path segments and encoded delimiters remain invalid', () => {
  for (const raw of [
    'https://example.com/in/name',
    'https://linkedin.com.example.com/in/name',
    'https://evil-linkedin.com/in/name',
    'https://guest@linkedin.com/in/name',
    'https://linkedin.com/company/name',
    'https://linkedin.com/in/name/extra',
    'https://linkedin.com/in/name%2Fextra',
    'https://linkedin.com/in/name%5Cextra',
    'https://linkedin.com/in/name%3Fextra',
    'https://linkedin.com/in/name%23extra',
    'https://linkedin.com/in/name%20extra',
    'https://linkedin.com/in/name%00extra',
    'https://linkedin.com/in/name%0Aextra',
    'https://linkedin.com/in/name%E2%80%8Bextra',
    'https://linkedin.com/in/name%E2%80%AEextra',
    'https://linkedin.com/in/%F0%9F',
    'https://linkedin.com/in/%',
    'https://linkedin.com/in/name%252Fextra',
  ]) assert.equal(parseLinkedInInput(raw).ok, false, raw);
});

test('empty handles and the existing 100-character limit remain enforced', () => {
  for (const raw of ['', '   ', 'linkedin.com/in/', `linkedin.com/in/${'a'.repeat(101)}`]) {
    assert.equal(parseLinkedInInput(raw).ok, false, raw);
  }
  assert.equal(parseLinkedInInput(`linkedin.com/in/${'a'.repeat(100)}`).ok, true);
});

test('the production lookup submits an encoded emoji URL and preserves the handle in its result', async () => {
  const requests = [];
  const { lookupRanking } = modules({
    fetch: async (url, init) => {
      requests.push({ url, ...init });
      return {
        ok: true, status: 200, headers: new Headers(),
        json: async () => ({ code: 0, data: init.method === 'POST'
          ? { taskId: 'emoji-profile-task', queryToken: 'test-token' }
          : { status: 'completed', result: { rank: 3, total: 100, self: { name: 'Amandine Picard' } } } }),
      };
    },
  })('mock.ts');
  for (const raw of [suppliedUrl, encodedUrl]) {
    const controller = new AbortController();
    try {
      const result = await lookupRanking(raw, { signal: controller.signal });
      assert.equal(result.status, 'found');
      assert.equal(result.inputUrl, encodedUrl);
      assert.equal(result.profile.handle, suppliedHandle);
      assert.equal(result.taskId, 'emoji-profile-task');
    } finally {
      controller.abort();
    }
  }
  assert.equal(requests.length, 4);
  for (const request of requests.filter(request => request.method === 'POST')) {
    assert.equal(request.url, '/bapi/peer-rank/rank');
    assert.deepEqual(JSON.parse(request.body), { linkedinUrl: encodedUrl });
  }
});

test('invalid profile URLs stop before the ranking service is called', async () => {
  const { lookupRanking } = modules({ fetch: () => assert.fail('Invalid input must not issue a request') })('mock.ts');
  for (const raw of ['https://example.com/in/🕹️-name', 'linkedin.com/in/name%2Fextra']) {
    assert.equal((await lookupRanking(raw)).status, 'invalid');
  }
});

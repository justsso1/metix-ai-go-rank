import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/recruiters-view/RecruitersViewApp.tsx', import.meta.url), 'utf8');
const tree = ts.createSourceFile('app.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = new Map();
function visit(node) {
  if (ts.isFunctionDeclaration(node) && node.name) functions.set(node.name.text, node.getText(tree));
  ts.forEachChild(node, visit);
}
visit(tree);

function lookup(flow, outcome) {
  const shown = [], errors = [];
  const controller = new AbortController();
  const context = vm.createContext({
    AbortController, URLSearchParams,
    parseLinkedInInput: raw => raw === 'invalid' ? { ok: false, message: 'Invalid URL' } : { ok: true, url: raw, handle: 'example' },
    lookupRanking: outcome, lookupPeerRankTask: outcome,
    abortRef: { current: null }, journeyActive: { current: false }, journeyNumber: { current: 0 },
    trackCampaign() {}, forgetLocalRemoval() {}, setError: value => { if (value) errors.push(value); },
    setResult() {}, setLoading() {}, setProgress() {}, setReveal() {}, setJourney() {},
    setPage() {}, setReturnScroll() {},
    history: { state: {}, replaceState() {}, pushState() {} }, location: { href: '/', pathname: '/', search: '' },
    window: { scrollY: 0, scrollTo() {} },
    applyRemoval: value => value, applySharedMockState: value => value,
    readCampaign: value => ({ result: value }),
    showUnavailableResult: value => shown.push(value), showInlineError: value => errors.push(value),
    missingResultAddress: handle => `/recruiters-view/${handle}`,
  });
  const code = ts.transpileModule(functions.get(flow), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(code, context);
  return { run: raw => context[flow](raw), shown, errors, controller };
}

for (const flow of ['runLookup', 'runTaskLookup']) {
  test(`${flow} shows fallback for network and malformed-response exceptions`, async () => {
    for (const failure of [new TypeError('Failed to fetch'), new Error('Malformed response'), null]) {
      const state = lookup(flow, async () => { throw failure; });
      await state.run('https://linkedin.com/in/example');
      assert.equal(state.shown.length, 1);
      assert.equal(state.shown[0].status, 'unavailable');
      assert.deepEqual(state.errors, []);
    }
  });
  test(`${flow} shows fallback for API validation and task failures`, async () => {
    const state = lookup(flow, async () => ({ status: 'invalid', inputUrl: '', message: 'Internal service error' }));
    await state.run('https://linkedin.com/in/example');
    assert.equal(state.shown[0]?.status, 'unavailable');
    assert.deepEqual(state.errors, []);
  });
  test(`${flow} ignores cancelled requests`, async () => {
    const state = lookup(flow, async () => { throw new DOMException('Aborted', 'AbortError'); });
    await state.run('https://linkedin.com/in/example');
    assert.deepEqual(state.shown, []);
    assert.deepEqual(state.errors, []);
  });
}

test('invalid profile input stays inline without calling the API', async () => {
  const state = lookup('runLookup', async () => { assert.fail('Must not call API'); });
  await state.run('invalid');
  assert.deepEqual(state.shown, []);
  assert.deepEqual(state.errors, ['Invalid URL']);
});

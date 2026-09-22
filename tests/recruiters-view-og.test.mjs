import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { getMockShareResults, hasShareSnapshot, shareImagePath, sharePageUrl } from '../src/recruiters-view/mock.ts';
import { shareMetadata } from '../src/recruiters-view/share.ts';
import { cardLayout } from '../src/recruiters-view/ranking-card.ts';
import { STORY_TEXTURE } from '../src/recruiters-view/card-material.ts';

const root = new URL('../', import.meta.url);
const read = (file) => readFile(new URL(file, root));
const hash = (value) => createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(await read('src/recruiters-view/og-manifest.json'));
const samples = getMockShareResults();
const decode = (value) => value.replace(/&#39;|&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

function meta(html, key) {
  return decode(html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`))?.[1] ?? '');
}

test('committed OG images match the renderer and the current mock results', async () => {
  assert.equal(manifest.templateHash, hash(await read('src/recruiters-view/ranking-card.ts')), 'Regenerate OG images after editing the shared card.');
  assert.equal(manifest.storyHash, hash(await read('src/recruiters-view/card-story.ts')), 'Regenerate OG images after editing the card copy.');
  assert.equal(manifest.rendererHash, hash(await read('src/recruiters-view/share-card.ts')), 'Regenerate OG images after editing the card renderer.');
  assert.equal(manifest.themeHash, hash(await read('src/recruiters-view/card-theme.ts')), 'Regenerate OG images after editing card themes.');
  assert.equal(manifest.foilHash, hash(await read(`public${STORY_TEXTURE}`)), 'Regenerate OG images after changing the material texture.');
  assert.equal(manifest.materialHash, hash(await read('src/recruiters-view/card-material.ts')));
  for (const [path, expected] of Object.entries(manifest.assetHashes)) assert.equal(hash(await read(`public${path}`)), expected, `Regenerate after changing ${path}`);
  assert.deepEqual(Object.keys(manifest.cards).sort(), ['default', ...samples.map((result) => result.profile.handle)].sort());
  for (const result of [undefined, ...samples]) {
    const key = result?.profile.handle ?? 'default';
    assert.deepEqual(manifest.cards[key].result, result ?? null, 'Regenerate OG images after changing mock data.');
    const png = await read(`public${shareImagePath(result?.profile.handle)}`);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), result ? 1280 : 1200);
    assert.equal(png.readUInt32BE(20), result ? cardLayout(result, 640).height * 2 : 630);
    assert.equal(hash(png), manifest.cards[key].sha256);
    assert.ok(png.length < 5_000_000);
  }
});

test('only published mock snapshots get personalized share paths', () => {
  for (const result of samples) {
    const handle = result.profile.handle;
    assert.equal(hasShareSnapshot(handle), true);
    assert.equal(sharePageUrl(handle), `https://go.metix.ai/share/${handle}`);
  }
  for (const handle of ['not-indexed', 'new-person', '__proto__', '../other']) {
    assert.equal(hasShareSnapshot(handle), false);
    assert.equal(shareImagePath(handle), '/recruiters-view/og/default.png');
    const link = new URL(sharePageUrl(handle));
    assert.equal(link.pathname, '/result');
    assert.equal(link.searchParams.get('u'), handle);
  }
});

test('built HTML gives crawlers personalized metadata without JavaScript', async () => {
  for (const result of samples) {
    const expected = shareMetadata(result);
    const html = (await read(`dist${expected.path}/index.html`)).toString();
    assert.equal(meta(html, 'og:title'), expected.title);
    assert.equal(meta(html, 'og:description'), expected.description);
    assert.equal(meta(html, 'og:url'), sharePageUrl(result.profile.handle));
    assert.equal(meta(html, 'og:image'), `https://go.metix.ai${expected.image}`);
    assert.equal(meta(html, 'og:image:alt'), expected.imageAlt);
    assert.equal(meta(html, 'og:image:width'), String(expected.imageWidth));
    assert.equal(meta(html, 'og:image:height'), String(expected.imageHeight));
    assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
    assert.equal(meta(html, 'twitter:image'), meta(html, 'og:image'));
    assert.equal(meta(html, 'twitter:image:alt'), expected.imageAlt);
    assert.equal(meta(html, 'robots'), 'noindex, nofollow');
    assert.ok(html.includes('The leaderboard'));
    assert.ok(html.includes('rv-result-hero'));
    assert.ok(!html.includes('class="rv-hero"'), 'Shared results must render directly below navigation, without the input hero.');
    assert.ok(!html.includes('class="rv-composer"'));
    assert.ok(!html.includes('class="rv-steps"'));
    assert.ok(!html.includes('rv-improve-card'), 'Profile tasks belong to the improve route.');
    assert.ok(!html.includes('rv-share-dialog'));
    assert.ok(html.includes('rv-share-channels'));
    assert.ok(html.includes('rv-card-artwork'));
    assert.ok((await read(`dist${expected.image}`)).length > 1000);
  }
  const sitemap = (await read('dist/sitemap.xml')).toString();
  assert.ok(!sitemap.includes('/recruiters-view'));
});

test('the base landing page has a dedicated general cover', async () => {
  const html = (await read('dist/index.html')).toString();
  assert.equal(meta(html, 'og:image'), 'https://go.metix.ai/recruiters-view/og/default.png');
  assert.ok(!meta(html, 'og:title').includes('Maya'));
  assert.ok(html.includes('class="rv-hero"'));
  assert.ok(html.includes('class="rv-composer"'));
  assert.ok(html.includes('class="rv-steps"'));
  assert.ok(!html.includes('class="rv-result-hero"'));
});

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const sourceDirectory = fileURLToPath(new URL('../src/recruiters-view/', import.meta.url));

// Run the production TS modules with controlled browser boundaries. Keep the real
// card generation and asset cache so the tests observe the exported artwork.
function modules(globals = {}, replacements = {}) {
  const context = vm.createContext({ Blob, URL, URLSearchParams, ...globals });
  const cache = new Map();
  function load(path) {
    if (cache.has(path)) return cache.get(path).exports;
    const module = { exports: {} };
    cache.set(path, module);
    const code = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
    }).outputText;
    const require = specifier => {
      if (specifier in replacements) return replacements[specifier];
      assert.ok(specifier.startsWith('.'), `Unexpected dependency: ${specifier}`);
      const target = resolve(dirname(path), specifier);
      return load(/\.[cm]?[jt]sx?$/.test(target) ? target : `${target}.ts`);
    };
    vm.runInContext(`(function(require, module, exports) {${code}\n})`, context, { filename: path })(require, module, module.exports);
    return module.exports;
  }
  return name => load(resolve(sourceDirectory, name));
}

function result(avatar) {
  return {
    status: 'found', inputUrl: 'https://linkedin.com/in/test-profile',
    profile: { handle: 'test-profile', fullName: 'Test Profile', headline: 'Backend developer',
      title: 'Backend developer', company: 'Example', location: 'United States', metro: 'United States',
      jobFamily: 'Software Engineering', yearsExperience: 5, skills: ['TypeScript'], avatar },
    query: { jobTitle: 'Backend developer', location: 'United States', seniorityBand: 'Any YOE', companyType: 'Any industry' },
    ranking: { kind: 'exact', rank: 58, poolSize: 496 }, recruiterReplyScore: 3.5,
    keywords: ['TypeScript'], suggestions: [], adviceKind: 'general', topSearch: 'Backend developer',
    rankedAt: '2026-10-12T09:13:00.000Z', profileVersion: 'live', revision: 0,
    peopleAbove: { strongest: [], justAhead: [] }, topThree: [],
  };
}

function browser() {
  const requests = [], artwork = [], timeouts = [], revocations = [], canvases = [];
  const objects = new Map(), controllers = new Map();
  const avatarUrl = 'https://media.licdn.com/profile.png';
  let avatarResponse = 'valid';
  class FileReader {
    readAsDataURL(blob) {
      blob.arrayBuffer().then(bytes => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString('base64')}`;
        this.onload?.();
      }, error => this.onerror?.(error));
    }
  }
  class Image {
    set src(value) {
      this.source = value;
      if (objects.has(value)) {
        objects.get(value).text().then(svg => { artwork.push(svg); this.onload?.(); });
      }
    }
    get src() { return this.source; }
    async decode() {
      if (this.source.endsWith(Buffer.from('corrupt image').toString('base64'))) throw new Error('Invalid image');
    }
  }
  const load = modules({
    FileReader, Image,
    AbortSignal: { timeout(duration) {
      const controller = new AbortController();
      timeouts.push(duration); controllers.set(controller.signal, controller);
      return controller.signal;
    } },
    fetch: async (path, options) => {
      requests.push(path);
      if (path === avatarUrl) {
        if (avatarResponse === 'timeout') {
          return new Promise((_, reject) => {
            options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true });
            queueMicrotask(() => controllers.get(options.signal).abort(new DOMException('Timed out', 'TimeoutError')));
          });
        }
        if (typeof avatarResponse === 'number') return { ok: false, status: avatarResponse };
      }
      return { ok: true, blob: async () => new Blob([
        path === avatarUrl && avatarResponse === 'corrupt' ? 'corrupt image' : `asset:${path}`,
      ], { type: 'image/png' }) };
    },
    URL: { createObjectURL(blob) { const id = `blob:card-${objects.size}`; objects.set(id, blob); return id; },
      revokeObjectURL(source) { revocations.push(source); } },
    document: { createElement(name) {
      assert.equal(name, 'canvas');
      const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }),
        toBlob(callback, type) { callback(new Blob(['rendered card'], { type })); } };
      canvases.push(canvas); return canvas;
    } },
  });
  return { ...load('share-card.browser.ts'), defaultAvatar: load('avatar.ts').DEFAULT_AVATAR,
    avatarUrl, requests, artwork, timeouts, revocations, canvases,
    respond(value) { avatarResponse = value; } };
}

function cardAvatar(svg) {
  const image = svg.match(/<image\b[^>]*data-profile-avatar="true"[^>]*\/>/);
  assert.ok(image, 'The exported card contains a profile avatar');
  return image[0].match(/\bhref="([^"]+)"/)[1].replaceAll('&amp;', '&');
}

// The native renderer treats the SVG keyword "transparent" as opaque black.
// "none" has the same visible result for this un-stroked background path.
const nativeSvg = svg => Buffer.from(svg.replaceAll('fill="transparent"', 'fill="none"'));

test('the supplied default avatar leaves empty margins transparent and keeps its person silhouette visible', async () => {
  const { DEFAULT_AVATAR } = modules()('avatar.ts');
  const svg = decodeURIComponent(DEFAULT_AVATAR.slice(DEFAULT_AVATAR.indexOf(',') + 1));
  const canvas = createCanvas(48, 48), context = canvas.getContext('2d');
  context.drawImage(await loadImage(nativeSvg(svg)), 0, 0, 48, 48);
  for (const [x, y] of [[0, 0], [24, 5], [8, 12], [40, 12]]) {
    assert.equal(context.getImageData(x, y, 1, 1).data[3], 0, `Background pixel (${x}, ${y}) is transparent`);
  }
  const pixels = context.getImageData(0, 0, 48, 48).data;
  assert.ok(pixels.some((value, index) => index % 4 === 3 && value > 0), 'Fallback artwork remains visible');
  assert.deepEqual([...context.getImageData(24, 18, 1, 1).data], [120, 143, 165, 255], 'The supplied filled head keeps its original color');
  assert.deepEqual([...context.getImageData(24, 45, 1, 1).data], [157, 179, 200, 255], 'The supplied filled body keeps its original color');
});

test('missing and API-provided default avatars use the same pale circular share-card background', async () => {
  const load = modules(), defaultAvatar = load('avatar.ts').DEFAULT_AVATAR;
  const apiDefault = 'https://front.openjobs-ai.com/data/ppicture/default.svg';
  const { rankingCardSvg, cardLayout } = load('ranking-card.ts');
  let baseline;
  for (const profileAvatar of [undefined, '', defaultAvatar, apiDefault]) {
    const snapshot = result(profileAvatar), svg = rankingCardSvg(snapshot), layout = cardLayout(snapshot);
    const avatar = svg.match(/<g class="rv-art-avatar">[\s\S]*?<\/g>/)?.[0];
    const clip = svg.match(/<clipPath id="[^"]+-avatar">[\s\S]*?<\/clipPath>/)?.[0];
    const profileImage = svg.match(/<image\b[^>]*data-profile-avatar="true"[^>]*\/>/)?.[0];
    const clipping = profileImage?.match(/\bclip-path="([^"]+)"/)?.[1];
    assert.ok(avatar && clip && profileImage && clipping);
    assert.equal(cardAvatar(svg), profileAvatar || defaultAvatar);
    // Supply the already-known public default artwork for the external resource.
    // Native SVG rendering ignores SVG image URLs, so resolve the image inline
    // while retaining its generated clipping and circular background.
    const uri = cardAvatar(svg) === apiDefault ? defaultAvatar : cardAvatar(svg);
    const embedded = decodeURIComponent(uri.slice(uri.indexOf(',') + 1))
      .replace(/<svg\b([^>]*)>/, (_, attributes) => `<svg x="${layout.pad}" y="${layout.identityY}" width="48" height="48"${attributes.replace(/\s(?:width|height)="[^"]*"/g, '')}>`);
    const resolvedAvatar = avatar.replace(profileImage, `<g clip-path="${clipping}">${embedded}</g>`);
    const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="${layout.pad} ${layout.identityY} 48 48"><defs>${clip}</defs>${resolvedAvatar}</svg>`;
    const canvas = createCanvas(48, 48), context = canvas.getContext('2d');
    context.drawImage(await loadImage(nativeSvg(artwork)), 0, 0);
    assert.deepEqual([...context.getImageData(24, 5, 1, 1).data], [236, 233, 248, 255], 'Empty avatar space uses the shared pale background');
    assert.equal(context.getImageData(0, 0, 1, 1).data[3], 0, 'The background stays inside its circle');
    assert.equal(context.getImageData(0, 47, 1, 1).data[3], 0, 'The supplied silhouette stays clipped to the circle');
    const pixels = [...context.getImageData(0, 0, 48, 48).data];
    if (baseline) assert.deepEqual(pixels, baseline, 'Missing, embedded, and API defaults have matching presentation');
    else baseline = pixels;
  }
});

test('a pending remote avatar keeps its visible fallback inside the circular share-card avatar', async () => {
  const load = modules(), { rankingCardSvg, cardLayout } = load('ranking-card.ts');
  const snapshot = result('https://media.licdn.com/pending.png');
  for (const width of [320, 640]) {
    const svg = rankingCardSvg(snapshot, width, { avatarPlaceholder: true }), layout = cardLayout(snapshot, width);
    const avatar = svg.match(/<g class="rv-art-avatar">[\s\S]*?<\/g>/)?.[0];
    const clip = svg.match(/<clipPath id="[^"]+-avatar">[\s\S]*?<\/clipPath>/)?.[0];
    const placeholder = avatar?.match(/<image\b[^>]*class="rv-art-avatar-placeholder"[^>]*\/>/)?.[0];
    const profileImage = avatar?.match(/<image\b[^>]*data-profile-avatar="true"[^>]*\/>/)?.[0];
    assert.ok(avatar && clip && placeholder && profileImage);
    const source = placeholder.match(/\bhref="([^"]+)"/)[1].replaceAll('&amp;', '&');
    const geometry = ['x', 'y', 'width', 'height'].map(attribute => {
      const value = placeholder.match(new RegExp(`\\b${attribute}="([^"]+)"`))?.[1];
      assert.ok(value, `The generated placeholder has ${attribute}`);
      return `${attribute}="${value}"`;
    }).join(' ');
    const clipping = placeholder.match(/\bclip-path="([^"]+)"/)?.[1];
    // Resolve the generated fallback image for the native renderer, retaining
    // its actual geometry and clipping. The pending remote image stays absent.
    const embedded = decodeURIComponent(source.slice(source.indexOf(',') + 1))
      .replace(/<svg\b([^>]*)>/, (_, attributes) => `<svg ${geometry}${attributes.replace(/\s(?:x|y|width|height)="[^"]*"/g, '')}>`);
    const resolvedAvatar = avatar.replace(profileImage, '')
      .replace(placeholder, `<g${clipping ? ` clip-path="${clipping}"` : ''}>${embedded}</g>`);
    const artwork = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="${layout.pad} ${layout.identityY} 48 48"><defs>${clip}</defs>${resolvedAvatar}</svg>`;
    const canvas = createCanvas(48, 48), context = canvas.getContext('2d');
    context.drawImage(await loadImage(nativeSvg(artwork)), 0, 0);
    for (const [x, y] of [[0, 0], [47, 0], [0, 47], [47, 47]]) {
      assert.equal(context.getImageData(x, y, 1, 1).data[3], 0, `Pending fallback corner (${x}, ${y}) is transparent at card width ${width}`);
    }
    assert.deepEqual([...context.getImageData(24, 5, 1, 1).data], [236, 233, 248, 255], 'Pending fallback keeps the pale circular background');
    assert.deepEqual([...context.getImageData(24, 18, 1, 1).data], [120, 143, 165, 255], 'Pending fallback keeps its visible person silhouette');
  }
});

test('missing avatar uses the embedded fallback without issuing an avatar request', async () => {
  const state = browser(), snapshot = result(undefined), before = JSON.stringify(snapshot);
  const blob = await state.createShareCardPng(snapshot, 320);
  assert.equal(blob.type, 'image/png');
  assert.equal(cardAvatar(state.artwork[0]), state.defaultAvatar);
  assert.equal(state.requests.some(path => path.startsWith('https://')), false);
  assert.equal(state.canvases[0].width, 640);
  assert.equal(state.revocations.length, 1);
  assert.equal(JSON.stringify(snapshot), before, 'Export preserves the business result');
});

for (const response of [403, 429, 'timeout', 'corrupt']) {
  test(`avatar ${response} still exports the card with the default avatar`, async () => {
    const state = browser(), snapshot = result(state.avatarUrl), before = JSON.stringify(snapshot);
    state.respond(response);
    const blob = await state.createShareCardPng(snapshot);
    assert.equal(blob.type, 'image/png');
    assert.equal(cardAvatar(state.artwork[0]), state.defaultAvatar);
    assert.equal(state.artwork[0].includes(state.avatarUrl), false, 'Export does not retry the failing external URL');
    assert.deepEqual(state.timeouts, [5000]);
    assert.equal(state.revocations.length, 1);
    assert.equal(JSON.stringify(snapshot), before, 'Fallback does not alter ranking/profile data');
  });
}

for (const response of [403, 'corrupt']) {
  test(`a ${response} avatar is retryable after recovery and preserves the other cached card assets`, async () => {
    const state = browser(), snapshot = result(state.avatarUrl);
    state.respond(response);
    await state.createShareCardPng(snapshot);
    const cardAssets = state.requests.filter(path => path !== state.avatarUrl);
    state.respond('valid');
    await state.createShareCardPng(snapshot);
    assert.equal(state.requests.filter(path => path === state.avatarUrl).length, 2);
    for (const path of cardAssets) assert.equal(state.requests.filter(request => request === path).length, 1);
    assert.notEqual(cardAvatar(state.artwork[1]), state.defaultAvatar);
    assert.match(cardAvatar(state.artwork[1]), /^data:image\/png;base64,/);
    assert.equal(state.revocations.length, 2);
  });
}

// Controlled hook lifecycle: exercise returned sources and late error callbacks,
// rather than asserting state/effect implementation details.
function avatarHook() {
  const states = [], effects = [], preloadImages = [];
  let stateIndex = 0, effectIndex = 0, pending = [];
  class Image { constructor() { preloadImages.push(this); } }
  const react = {
    useState(initial) {
      const index = stateIndex++;
      if (!(index in states)) states[index] = initial;
      return [states[index], value => { states[index] = typeof value === 'function' ? value(states[index]) : value; }];
    },
    useEffect(callback, dependencies) {
      const index = effectIndex++, previous = effects[index];
      if (!previous || dependencies.some((value, key) => !Object.is(value, previous.dependencies[key]))) {
        pending.push(() => { previous?.cleanup?.(); effects[index] = { dependencies, cleanup: callback() }; });
      }
    },
  };
  const load = modules({ Image }, { react, 'react/jsx-runtime': { jsx: (type, props) => ({ type, props }) } });
  const { useAvatarSource } = load('ProfileAvatar.tsx');
  return { preloadImages, defaultAvatar: load('avatar.ts').DEFAULT_AVATAR,
    render(source) {
      stateIndex = 0; effectIndex = 0;
      const value = useAvatarSource(source);
      const effectsToRun = pending; pending = []; effectsToRun.forEach(effect => effect());
      return value;
    } };
}

test('UI keeps its pending-image placeholder until load and restores the fallback on an image error', () => {
  const state = avatarHook(), url = 'https://media.licdn.com/a.png';
  const initial = state.render(url);
  assert.equal(initial.source, state.defaultAvatar);
  assert.equal(initial.isLoading, false);
  const pending = state.render(url);
  assert.equal(pending.source, url);
  assert.equal(pending.isLoading, true);
  pending.onLoad();
  const loaded = state.render(url);
  assert.equal(loaded.source, url);
  assert.equal(loaded.isLoading, false);
  loaded.onError();
  const failed = state.render(url);
  assert.equal(failed.source, state.defaultAvatar);
  assert.equal(failed.isLoading, false);
  assert.equal(state.preloadImages.length, 0, 'Only the displayed image issues a request');
});

test('late load and error callbacks from a previous profile do not alter the current avatar or placeholder', () => {
  const state = avatarHook(), first = 'https://media.licdn.com/first.png', second = 'https://media.licdn.com/second.png';
  state.render(first);
  const previous = state.render(first);
  assert.equal(previous.source, first);
  assert.equal(state.render(second).source, state.defaultAvatar);
  const pending = state.render(second);
  assert.equal(pending.source, second);
  assert.equal(pending.isLoading, true);
  previous.onLoad();
  assert.equal(state.render(second).isLoading, true, 'An old load cannot hide the current placeholder');
  previous.onError();
  assert.equal(state.render(second).source, second);
  assert.equal(state.render(second).isLoading, true);
  pending.onLoad();
  assert.equal(state.render(second).isLoading, false);
  previous.onLoad(); previous.onError();
  assert.equal(state.render(second).source, second);
  assert.equal(state.render(second).isLoading, false);
  const missing = state.render(undefined);
  assert.equal(missing.source, state.defaultAvatar);
  assert.equal(missing.isLoading, false);
  assert.equal(state.preloadImages.length, 0);
});

test('the embedded fallback is never treated as a pending external avatar', () => {
  const state = avatarHook();
  state.render(state.defaultAvatar);
  const fallback = state.render(state.defaultAvatar);
  assert.equal(fallback.source, state.defaultAvatar);
  assert.equal(fallback.isLoading, false);
  assert.equal(state.preloadImages.length, 0);
});

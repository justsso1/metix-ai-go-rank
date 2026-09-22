import { ROUTES } from './site.ts';
export type CampaignScene = 'root' | 'result' | 'share' | 'improve' | 'opportunities';
type SafeValue = string | number | boolean;
type CampaignProperties = Record<string, SafeValue | undefined>;
type AnalyticsWindow = Window & {
  metix?: { ready?: boolean; track?: (name: string, props?: CampaignProperties) => void };
  gtag?: (...args: unknown[]) => void;
};

const scenePaths: Record<CampaignScene, string> = {
  root: ROUTES.entry, result: ROUTES.result, share: `${ROUTES.share}/:handle`, improve: ROUTES.improve, opportunities: ROUTES.opportunities,
};
const safeKeys = new Set([
  'scene', 'source', 'location', 'method', 'status', 'reason', 'result_type',
  'channel', 'destination', 'format', 'revision', 'rank_bucket', 'role_count',
  'job_count', 'has_result', 'is_preview', 'mode', 'count',
]);
let pending: Array<[string, CampaignProperties]> = [];
let startupTimer: number | undefined;
let lastScene: CampaignScene | undefined;

function browser(): AnalyticsWindow | undefined {
  return typeof window !== 'undefined' && window.location.hostname === 'go.metix.ai'
    ? window as AnalyticsWindow : undefined;
}

function safeProperties(props: CampaignProperties): CampaignProperties {
  const safe: CampaignProperties = {};
  for (const [key, value] of Object.entries(props)) {
    if (!safeKeys.has(key)) continue;
    // Callers supply categorical dimensions only. Personal text, URLs, emails,
    // free-form errors and profile fields are deliberately excluded.
    if (typeof value === 'string' && /^[a-z0-9_-]{1,64}$/i.test(value)) safe[key] = value;
    else if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) safe[key] = value;
  }
  return safe;
}

function cleanup() {
  const target = browser();
  target?.removeEventListener('metix:ready', flushPending);
  if (startupTimer !== undefined) target?.clearTimeout(startupTimer);
  startupTimer = undefined;
}

function flushPending() {
  const target = browser();
  if (!target?.metix?.ready || typeof target.metix.track !== 'function') return;
  const events = pending;
  pending = [];
  cleanup();
  for (const [name, props] of events) {
    try { target.metix.track(name, props); } catch { /* Best effort. */ }
  }
}

export function trackCampaign(name: string, props: CampaignProperties = {}): void {
  const target = browser();
  if (!target || !/^[a-z][a-z0-9_]{0,63}$/.test(name)) return;
  const safe = safeProperties(props);
  try {
    if (target.metix?.ready && typeof target.metix.track === 'function') {
      target.metix.track(name, safe);
      return;
    }
    pending.push([name, safe]);
    if (pending.length > 40) pending.shift();
    if (startupTimer === undefined) {
      target.addEventListener('metix:ready', flushPending);
      startupTimer = target.setTimeout(() => {
        pending = [];
        cleanup();
      }, 5000);
    }
  } catch { /* Analytics must never interrupt the activity. */ }
}

export function trackCampaignPage(scene: CampaignScene): void {
  const target = browser();
  if (!target || !Object.prototype.hasOwnProperty.call(scenePaths, scene) || scene === lastScene) return;
  lastScene = scene;
  trackCampaign('page_view', { scene });
  try {
    target.gtag?.('event', 'page_view', {
      campaign: 'rank',
      page_location: `https://go.metix.ai${scenePaths[scene]}`,
      page_title: `Metix Rank — ${scene}`,
      page_referrer: '',
    });
  } catch { /* The backend tracker remains available if GA is blocked. */ }
}

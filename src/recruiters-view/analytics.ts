export type CampaignScene = 'root' | 'result' | 'improve' | 'opportunities' | 'unsubscribe';
export type CampaignEventName =
  | 'page_view' | 'lookup_start' | 'lookup_success' | 'lookup_error' | 'result_view'
  | 'navigate' | 'remove_profile' | 'job_click' | 'share' | 'card_download'
  | 'email_request' | 'unsubscribe';
type SafeValue = string | number | boolean;
type CampaignProperties = Record<string, SafeValue | undefined>;
type TrackEvent = {
  eventType: string;
  name: string;
  moduleId?: string;
  properties?: CampaignProperties;
};
type AnalyticsWindow = Window & {
  metix?: { ready?: boolean; track?: (input: string | TrackEvent, props?: CampaignProperties, forceFlush?: boolean) => void };
};

const scenes = new Set<CampaignScene>(['root', 'result', 'improve', 'opportunities', 'unsubscribe']);
const safeKeys = new Set([
  'scene', 'source', 'location', 'method', 'status', 'reason', 'result_type',
  'channel', 'destination', 'format', 'revision', 'rank_bucket', 'role_count',
  'job_count', 'has_result', 'is_preview', 'mode', 'count',
]);
let pending: Array<[CampaignEventName, CampaignProperties]> = [];
let startupTimer: number | undefined;
let lastScene: CampaignScene | undefined;

function browser(): AnalyticsWindow | undefined {
  return typeof window !== 'undefined' && ['go.metix.ai', 'go-dev.metix.ai'].includes(window.location.hostname)
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

function statusType(status: SafeValue | undefined, fallback: string): string {
  if (status === 'saved') return 'success';
  if (status === 'error') return 'error';
  return fallback;
}

/** Maps a campaign action onto the homepage tracker contract: eventType, name, moduleId. */
function resolveEvent(name: CampaignEventName, props: CampaignProperties): { event: TrackEvent; flush: boolean } | null {
  const source = props.source;
  if (name === 'page_view') return { event: { eventType: 'page_view', name: 'page_view', properties: props }, flush: false };
  if (name === 'lookup_start') return { event: { eventType: 'start', name: 'lookup', moduleId: 'lookup', properties: props }, flush: true };
  if (name === 'lookup_success') return { event: { eventType: 'success', name: 'lookup', moduleId: 'lookup', properties: props }, flush: false };
  if (name === 'lookup_error') return { event: { eventType: 'error', name: 'lookup', moduleId: 'lookup', properties: props }, flush: false };
  if (name === 'result_view') return { event: { eventType: 'show', name: 'result', moduleId: 'result', properties: props }, flush: false };
  if (name === 'navigate') return { event: { eventType: 'click', name: 'navigate', moduleId: 'content', properties: props }, flush: false };
  if (name === 'remove_profile') return { event: { eventType: 'click', name: 'remove_profile', moduleId: 'result', properties: props }, flush: true };
  if (name === 'job_click') return { event: { eventType: 'click', name: 'job', moduleId: 'opportunities', properties: props }, flush: true };
  if (name === 'share') return { event: { eventType: 'click', name: 'share', moduleId: 'share', properties: props }, flush: true };
  if (name === 'card_download') return { event: { eventType: 'click', name: 'card_download', moduleId: 'share', properties: props }, flush: true };
  if (name === 'email_request') {
    const eventName = source === 'job_shortlist' || source === 'ranking_update' ? source : 'email_request';
    const moduleId = source === 'job_shortlist' ? 'opportunities' : 'improve';
    const eventType = statusType(props.status, 'submit');
    return { event: { eventType, name: eventName, moduleId, properties: props }, flush: eventType === 'submit' };
  }
  if (name === 'unsubscribe') {
    const eventType = statusType(props.status, 'submit');
    return { event: { eventType, name: 'unsubscribe', moduleId: 'unsubscribe', properties: props }, flush: eventType === 'submit' };
  }
  return null;
}

function send(target: AnalyticsWindow, name: CampaignEventName, props: CampaignProperties): void {
  const resolved = resolveEvent(name, props);
  if (resolved) target.metix?.track?.(resolved.event, undefined, resolved.flush);
}

function flushPending() {
  const target = browser();
  if (!target?.metix?.ready || typeof target.metix.track !== 'function') return;
  const events = pending;
  pending = [];
  cleanup();
  for (const [name, props] of events) {
    try { send(target, name, props); } catch { /* Best effort. */ }
  }
}

export function trackCampaign(name: CampaignEventName, props: CampaignProperties = {}): void {
  const target = browser();
  if (!target || !/^[a-z][a-z0-9_]{0,63}$/.test(name)) return;
  const safe = safeProperties(props);
  try {
    if (target.metix?.ready && typeof target.metix.track === 'function') {
      send(target, name, safe);
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
  if (!target || !scenes.has(scene) || scene === lastScene) return;
  lastScene = scene;
  trackCampaign('page_view', { scene });
}

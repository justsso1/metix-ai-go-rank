import { ROUTES, SITE_ORIGIN, showTaskPath } from './site.ts';
import type { RankLookupFound } from './types';

export type CampaignPage = 'entry' | 'result' | 'improve' | 'opportunities';
export type ResultPage = Exclude<CampaignPage, 'entry'>;
export function taskIdFromShowPath(path: string): string | null {
  const match = /^\/show\/([^/]+)\/?$/.exec(path);
  if (!match) return null;
  try { return decodeURIComponent(match[1]); }
  catch { return null; }
}
export function campaignPage(path: string, search = ''): CampaignPage {
  if (/\/opportunities\/?$/.test(path)) return 'opportunities';
  if (/\/improve\/?$/.test(path)) return 'improve';
  const params = new URLSearchParams(search);
  if (taskIdFromShowPath(path) !== null || /\/(?:result|share)\/?$/.test(path) || params.has('u') || params.has('task_id') || params.has('taskId')) return 'result';
  return 'entry';
}
export function campaignAddress(result: RankLookupFound, page: ResultPage): string {
  const url = new URL(ROUTES.entry, SITE_ORIGIN);
  if (result.taskId) {
    if (page === 'result') {
      url.pathname = showTaskPath(result.taskId);
    } else {
      url.pathname = ROUTES[page];
      url.searchParams.set('taskId', result.taskId);
    }
    return url.pathname + url.search;
  }

  if (page !== 'result') url.pathname = ROUTES[page];
  url.searchParams.set('u', result.profile.handle);
  url.searchParams.set('revision', String(result.revision));
  url.searchParams.set('at', result.rankedAt);
  return url.pathname + url.search;
}
export function missingResultAddress(handle: string): string {
  return `${ROUTES.result}?${new URLSearchParams({ u: handle })}`;
}
export const viewStateKey = (handle: string) => `metix-rv-view:${handle}`;

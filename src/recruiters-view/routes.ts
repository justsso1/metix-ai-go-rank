import { ROUTES } from './site.ts';
import { resultShareUrl } from './campaign.ts';
import type { RankLookupFound } from './types';

export type CampaignPage = 'entry' | 'result' | 'improve' | 'opportunities';
export type ResultPage = Exclude<CampaignPage, 'entry'>;
export function campaignPage(path: string, search = ''): CampaignPage {
  if (/\/opportunities\/?$/.test(path)) return 'opportunities';
  if (/\/improve\/?$/.test(path)) return 'improve';
  if (/\/(result|share\/[^/]+)\/?$/.test(path) || new URLSearchParams(search).has('u')) return 'result';
  return 'entry';
}
export function campaignAddress(result: RankLookupFound, page: ResultPage): string {
  const url = new URL(resultShareUrl(result));
  if (page !== 'result') {
    url.pathname = ROUTES[page];
    url.searchParams.set('u', result.profile.handle);
    url.searchParams.set('revision', String(result.revision));
    url.searchParams.set('at', result.rankedAt);
  }
  url.searchParams.set('resume', '1');
  return url.pathname + url.search;
}
export function missingResultAddress(handle: string): string {
  return `${ROUTES.result}?${new URLSearchParams({ u: handle, resume: '1' })}`;
}
export const viewStateKey = (handle: string) => `metix-rv-view:${handle}`;

import { showsJobMatches } from './campaign.ts';
import { readEmailRequest, submitEmailRequest, type EmailRequestOptions } from './email-request.ts';
import type { RankLookupFound } from './types';

export { validEmail as validShortlistEmail, type EmailRequest as ShortlistRequest } from './email-request.ts';
export const shortlistKey = (handle: string) => `metix-rv-job-shortlist-v1:${handle}`;

export function readShortlist(handle: string, storage?: EmailRequestOptions['storage']) {
  return readEmailRequest(shortlistKey(handle), storage);
}

/** Preview only: records the request without unlocking jobs or sending email. */
export async function submitShortlist(result: RankLookupFound, rawEmail: string, options: EmailRequestOptions = {}) {
  if (!showsJobMatches(result)) throw new Error('Job matches are available for profiles in the top 1%.');
  return submitEmailRequest(shortlistKey(result.profile.handle), rawEmail, options);
}

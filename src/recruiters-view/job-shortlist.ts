import { showsJobMatches } from './campaign.ts';
import { readEmailRequest, submitEmailRequest, validEmail, type EmailRequestOptions } from './email-request.ts';
import type { RankLookupFound } from './types';

export { validEmail as validShortlistEmail, type EmailRequest as ShortlistRequest } from './email-request.ts';
export const shortlistKey = (handle: string) => `metix-rv-job-shortlist-v1:${handle}`;

export function readShortlist(handle: string, storage?: EmailRequestOptions['storage']) {
  return readEmailRequest(shortlistKey(handle), storage);
}

/** Saves the request after the live service accepts a TOP_JOBS subscription. */
export async function submitShortlist(result: RankLookupFound, rawEmail: string, options: EmailRequestOptions = {}) {
  if (!showsJobMatches(result)) throw new Error('Job matches are available for profiles in the top 1%.');
  const email = rawEmail.trim();
  if (!validEmail(email)) throw new Error('Enter a valid email address.');
  if (result.profileVersion === "live" && result.inputUrl) {
    const { requestPeerRankEmail } = await import("./peer-rank-api.ts");
    await requestPeerRankEmail(result.inputUrl, email, "TOP_JOBS", options.signal);
  }
  return submitEmailRequest(shortlistKey(result.profile.handle), email, options);
}

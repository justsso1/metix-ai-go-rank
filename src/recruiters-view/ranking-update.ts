import { readEmailRequest, submitEmailRequest, validEmail, type EmailRequestOptions } from './email-request.ts';

export { validEmail as validRankingUpdateEmail, type EmailRequest as RankingUpdateRequest } from './email-request.ts';
export const rankingUpdateKey = (handle: string) => `metix-rv-ranking-update-v1:${handle}`;

export function readRankingUpdate(handle: string, storage?: EmailRequestOptions['storage']) {
  return readEmailRequest(rankingUpdateKey(handle), storage);
}

/** Saves the request after the live service accepts a NEXT_RANK subscription. */
export async function submitRankingUpdate(handle: string, email: string, options: EmailRequestOptions & { linkedinUrl?: string } = {}) {
  const trimmed = email.trim();
  if (!validEmail(trimmed)) throw new Error('Enter a valid email address.');
  if (options.linkedinUrl) {
    const { requestPeerRankEmail } = await import("./peer-rank-api.ts");
    await requestPeerRankEmail(options.linkedinUrl, trimmed, "NEXT_RANK", options.signal);
  }
  return submitEmailRequest(rankingUpdateKey(handle), trimmed, options);
}

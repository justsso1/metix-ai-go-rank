import { readEmailRequest, submitEmailRequest, type EmailRequestOptions } from './email-request.ts';

export { validEmail as validRankingUpdateEmail, type EmailRequest as RankingUpdateRequest } from './email-request.ts';
export const rankingUpdateKey = (handle: string) => `metix-rv-ranking-update-v1:${handle}`;

export function readRankingUpdate(handle: string, storage?: EmailRequestOptions['storage']) {
  return readEmailRequest(rankingUpdateKey(handle), storage);
}

/** One explicit submission acknowledges a profile edit and requests its ranking email.
 * Preview adapter only: it saves that intent without detecting edits, changing ranks,
 * or sending email. Replace with the update-request API when available. */
export function submitRankingUpdate(handle: string, email: string, options: EmailRequestOptions = {}) {
  return submitEmailRequest(rankingUpdateKey(handle), email, options);
}

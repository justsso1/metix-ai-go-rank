import { readEmailRequest, submitEmailRequest, type EmailRequestOptions } from './email-request.ts';

export const indexNotificationKey = (handle: string) => `metix-rv-index-notification-v1:${handle}`;
export function readIndexNotification(handle: string, storage?: EmailRequestOptions['storage']) {
  return readEmailRequest(indexNotificationKey(handle), storage);
}
export function submitIndexNotification(handle: string, email: string, options: EmailRequestOptions = {}) {
  return submitEmailRequest(indexNotificationKey(handle), email, options);
}

// Public URLs are shared by Astro metadata, social links and card artwork.
export const SITE_ORIGIN = 'https://go.metix.ai';
export const CAMPAIGN_BASE = '/recruiters-view';
export const SITE_LABEL = 'go.metix.ai/recruiters-view';
export const ROUTES = { entry: `${CAMPAIGN_BASE}/`, share: '/share', show: '/show', result: `${CAMPAIGN_BASE}/result`, improve: `${CAMPAIGN_BASE}/improve`, opportunities: `${CAMPAIGN_BASE}/opportunities`, unsubscribe: '/unsubscribe' } as const;
export const shareTaskPath = (taskId: string) => `${ROUTES.share}/${encodeURIComponent(taskId)}`;
export const showTaskPath = (taskId: string) => `${ROUTES.show}/${encodeURIComponent(taskId)}`;

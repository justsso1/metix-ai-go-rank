import { shareMetadata } from './share';
import { shareTaskPath } from './site';

type TaskResponse = {
  code?: unknown;
  data?: {
    status?: unknown;
    result?: unknown;
    rank?: unknown;
    total?: unknown;
    self?: { name?: unknown };
    og_image_url?: unknown;
    og_image_width?: unknown;
    og_image_height?: unknown;
  };
};

type TokenResponse = { code?: unknown; data?: { queryToken?: unknown } };

function imageUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch { return null; }
}

function dimension(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export async function shareMetadataForTask(taskId: string, shareOrigin: string, path = shareTaskPath(taskId)): Promise<ReturnType<typeof shareMetadata>> {
  const meta = shareMetadata();
  const shareUrl = new URL(path, shareOrigin);
  meta.path = shareUrl.href;

  if (!taskId.trim() || taskId.length > 64) return meta;
  const origin = process.env.NEXT_PUBLIC_API_BASE?.replace(/\/+$/, '');
  if (!origin || !/^https?:\/\/[^/]+$/.test(origin)) return meta;

  try {
    const signal = AbortSignal.timeout(8_000);
    const tokenResponse = await fetch(`${origin}/hire/bapi/peer-rank/email/result-token`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ task_id: taskId }),
      cache: 'no-store',
      signal,
    });
    if (!tokenResponse.ok) return meta;
    const tokenBody = await tokenResponse.json() as TokenResponse;
    if (tokenBody.code !== 0 && tokenBody.code !== 200) return meta;
    const queryToken = typeof tokenBody.data?.queryToken === 'string' ? tokenBody.data.queryToken.trim() : '';
    if (!queryToken) return meta;

    const response = await fetch(`${origin}/hire/bapi/peer-rank/rank/${encodeURIComponent(taskId)}`, {
      headers: { Accept: 'application/json', 'X-Peer-Rank-Token': queryToken },
      cache: 'no-store',
      signal,
    });
    if (!response.ok) return meta;
    const body = await response.json() as TaskResponse;
    if (body.code !== 0 && body.code !== 200) return meta;
    const state = body.data;
    if (!state || state.status === 'pending' || state.status === 'running' || state.status === 'processing' || state.status === 'queued' || state.status === 'failed' || state.status === 'error') return meta;
    const result = state.result && typeof state.result === 'object' ? state.result as typeof state : state;
    const image = imageUrl(state.og_image_url ?? result.og_image_url);
    if (!image) return meta;

    const name = typeof result.self?.name === 'string' ? result.self.name.trim().slice(0, 80) : '';
    const rank = Number(result.rank);
    const total = Number(result.total);
    meta.title = name ? `${name}'s Recruiter Search ranking · Metix AI` : 'Recruiter Search ranking · Metix AI';
    meta.description = Number.isInteger(rank) && rank > 0 && Number.isInteger(total) && total >= rank
      ? `${name || 'This candidate'} ranks #${rank} among ${total} peers in a recruiter search.`
      : 'See this candidate’s Recruiter Search ranking.';
    meta.image = image;
    meta.imageWidth = dimension(state.og_image_width ?? result.og_image_width, meta.imageWidth);
    meta.imageHeight = dimension(state.og_image_height ?? result.og_image_height, meta.imageHeight);
    meta.imageAlt = name ? `${name}'s Recruiter Search ranking` : 'Recruiter Search ranking';
  } catch { /* A failed metadata lookup still serves the share page. */ }
  return meta;
}

import { peerRankApiBase } from "./peer-rank-api";

type UnsubscribeBody = { code?: unknown; msg?: unknown };

export function unsubscribeToken(search: string): string | null {
  return new URLSearchParams(search).get("token")?.trim() || null;
}

function failureMessage(status: number, msg: string, retryAfter: string | null): string {
  if (status === 429) {
    const seconds = Number(retryAfter);
    const wait = Number.isFinite(seconds) && seconds >= 0 ? ` Try again in ${Math.ceil(seconds)} seconds.` : "";
    return `${msg || "Too many unsubscribe attempts."}${wait}`;
  }
  if (status === 400 || status === 404) return msg || "This unsubscribe link is invalid.";
  if (status === 503) return msg || "Unsubscribe is temporarily unavailable. Try again in a moment.";
  return msg || "The unsubscribe request did not finish. Try again.";
}

/** Submits the email link token only after the user confirms. */
export async function unsubscribePeerRank(
  token: string,
  signal?: AbortSignal,
): Promise<{ ok: true } | { ok: false; message: string }> {
  let response: Response;
  try {
    response = await fetch(`${peerRankApiBase()}/peer-rank/unsubscribe`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      signal,
    });
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    return { ok: false, message: "The unsubscribe request did not finish. Try again." };
  }

  let body: UnsubscribeBody = {};
  try { body = await response.json() as UnsubscribeBody; }
  catch { /* Use the HTTP status when the response is not JSON. */ }
  const msg = typeof body.msg === "string" ? body.msg.trim() : "";
  const code = typeof body.code === "number" ? body.code : response.status;
  if (response.ok && (code === 200 || code === 0)) return { ok: true };
  return { ok: false, message: failureMessage(response.ok ? code : response.status, msg, response.headers.get("Retry-After")) };
}

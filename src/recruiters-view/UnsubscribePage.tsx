import { type FormEvent, useEffect, useRef, useState } from "react";
import { ROUTES } from "./site";
import { trackCampaign, trackCampaignPage } from "./analytics";
import { unsubscribePeerRank, unsubscribeToken } from "./unsubscribe";

export default function UnsubscribePage() {
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [complete, setComplete] = useState(false);
  const submission = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    trackCampaignPage("unsubscribe");
    return () => submission.current?.abort();
  }, []);

  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [complete]);

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submission.current || complete) return;
    const token = unsubscribeToken(window.location.search);
    if (!token) {
      setError("This unsubscribe link is invalid.");
      return;
    }

    const controller = new AbortController();
    submission.current = controller;
    setSubmitting(true);
    setError("");
    trackCampaign("unsubscribe", { status: "submit" });
    try {
      const result = await unsubscribePeerRank(token, controller.signal);
      if (controller.signal.aborted) return;
      if (result.ok) {
        setComplete(true);
        trackCampaign("unsubscribe", { status: "saved" });
      } else if ("message" in result) {
        setError(result.message);
        trackCampaign("unsubscribe", { status: "error" });
      }
    } catch (err) {
      if (controller.signal.aborted || (err as Error).name === "AbortError") return;
      setError("The unsubscribe request did not finish. Try again.");
      trackCampaign("unsubscribe", { status: "error" });
    } finally {
      if (submission.current === controller) {
        submission.current = null;
        if (!controller.signal.aborted) setSubmitting(false);
      }
    }
  }

  return (
    <div className="rv-missing-page rv-unsubscribe-page">
      <div className="wrap">
        <section className="rv-unsubscribe-content">
          <h1 ref={heading} tabIndex={-1} className="rv-unsubscribe-title">{complete ? "You’re unsubscribed." : "Unsubscribe from emails"}</h1>
          {complete ? (
            <>
              <p className="rv-unsubscribe-copy" role="status">You’ll no longer receive emails from Metix AI.</p>
              <a className="btn btn-primary rv-unsubscribe-home" href={ROUTES.entry} data-track="unsubscribe_home" data-track-location="unsubscribe">Back to home</a>
            </>
          ) : (
            <>
              <p className="rv-unsubscribe-copy">You’ll no longer receive emails from Metix AI.</p>
              <form className="rv-unsubscribe-form" onSubmit={confirm}>
                <div className="rv-unsubscribe-actions">
                  <a className="btn btn-ghost" href={ROUTES.entry} data-track="unsubscribe_keep" data-track-location="unsubscribe">Keep emails</a>
                  <button className="btn btn-primary" type="submit" disabled={submitting} data-track="unsubscribe_submit_click" data-track-location="unsubscribe">{submitting ? "Unsubscribing…" : "Unsubscribe"}</button>
                </div>
                {error && <p className="rv-error" role="alert">{error}</p>}
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

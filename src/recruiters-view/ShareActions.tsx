import { trackCampaign } from './analytics';
import { useEffect, useState } from 'react';
import { Check, Download, Link2, Linkedin, createLucideIcon } from 'lucide-react';
import { cardStory } from './card-story';
import { cardThemeName } from './card-theme';
import { resultShareUrl } from './campaign';
import { linkedinShareUrl, shareText } from './mock';
import { rankingIdentity } from './leaderboard';
import type { RankLookupFound } from './types';

const ShareX = createLucideIcon('ShareX', [
  ['path', { d: 'M4 3h4l12 18h-4L4 3Z', key: 'letter' }],
  ['path', { d: 'm20 3-6.5 7.4M10.5 13.6 4 21', key: 'cross' }],
]);
const shareIconProps = { className: 'rv-share-icon', size: 16, strokeWidth: 1.75, 'aria-hidden': true } as const;

export default function ShareActions({ result, width, prepareImage = true }: { result: RankLookupFound; width: number; prepareImage?: boolean }) {
  const [image, setImage] = useState(''), [error, setError] = useState(''), [copied, setCopied] = useState(false), [retry, setRetry] = useState(0), [shareUrl, setShareUrl] = useState('');
  const identity = rankingIdentity(result), post = shareText(result);
  const primary = cardStory(result).primaryAction;
  const comparisonKey = JSON.stringify(result.previousRanking);
  useEffect(() => {
    let cancelled = false, objectUrl = '';
    setImage(''); setError(''); setCopied(false);
    if (!prepareImage) return;
    const timer = window.setTimeout(() => {
      void import('./share-card.browser').then(({ createShareCardPng }) => createShareCardPng(result, width)).then(blob => {
        if (cancelled) return; objectUrl = URL.createObjectURL(blob); setImage(objectUrl);
      }).catch(() => { if (!cancelled) setError('Could not prepare your card.'); });
    }, 150);
    return () => { cancelled = true; window.clearTimeout(timer); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [identity, result.recruiterReplyScore, comparisonKey, width, retry, prepareImage]);
  useEffect(() => {
    setShareUrl(resultShareUrl(result, window.location.origin));
  }, [identity, result.taskId, result.revision, result.rankedAt]);
  useEffect(() => { if (copied) { const timer = window.setTimeout(() => setCopied(false), 2400); return () => clearTimeout(timer); } }, [copied]);
  async function copy() {
    try { await navigator.clipboard.writeText(`${post} ${window.location.href}`); setCopied(true); setError(''); trackCampaign('share', { channel: 'copy' }); }
    catch { setError('Could not copy the share text. Please try again.'); }
  }
  return <div className={`rv-share-actions is-${primary}-primary`} data-theme={cardThemeName(result.ranking)} aria-label="Share your ranking">
    <div className="rv-share-channels">
      <a aria-disabled={!shareUrl} onClick={event => { if (!shareUrl) event.preventDefault(); else trackCampaign("share", { channel: "x" }); }} href={shareUrl ? `https://twitter.com/intent/tweet?text=${encodeURIComponent(post)}&url=${encodeURIComponent(shareUrl)}` : undefined} target="_blank" rel="noopener noreferrer"><ShareX {...shareIconProps} />Share on X</a>
      <a aria-disabled={!shareUrl} onClick={event => { if (!shareUrl) event.preventDefault(); else trackCampaign("share", { channel: "linkedin" }); }} href={shareUrl ? linkedinShareUrl(post, shareUrl) : undefined} target="_blank" rel="noopener noreferrer"><Linkedin {...shareIconProps} />LinkedIn</a>
      <button type="button" disabled={!shareUrl} data-track="share_copy_attempt" data-track-location="share" onClick={copy}>{copied ? <Check {...shareIconProps} /> : <Link2 {...shareIconProps} />}{copied ? 'Copied' : 'Copy link'}</button>
      {image ? <a onClick={() => trackCampaign("card_download", { format: "png" })} href={image} download={`metix-ranking-${result.profile.handle}.png`}><Download {...shareIconProps} />Download card</a> : <button type="button" disabled={!error} data-track="card_download_retry" data-track-location="share" onClick={() => setRetry(value=>value+1)}><Download {...shareIconProps} />{error ? 'Retry download' : 'Preparing…'}</button>}
    </div>
    <span className="rv-sr-only" role="status">{copied ? 'Share text copied.' : ''}</span>
    {error && <p className="rv-share-error" role="alert">{error}</p>}
  </div>;
}

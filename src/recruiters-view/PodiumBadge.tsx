import type { ImgHTMLAttributes } from 'react';
import { podiumFrame } from './podium-frame';

/** A decorative metallic frame; row emphasis remains reserved for the current profile. */
export default function PodiumBadge({ rank, className, style, ...props }: ImgHTMLAttributes<HTMLImageElement> & { rank?: number }) {
  const frame = podiumFrame(rank);
  if (!frame) return null;
  return <img src={frame.src} alt="" className={`rv-podium-badge is-place-${rank}${className ? ` ${className}` : ''}`}
    style={{ left: `${frame.x * 100}%`, top: `${frame.y * 100}%`, width: `${frame.w * 100}%`, height: `${frame.h * 100}%`, ...style }} {...props} />;
}

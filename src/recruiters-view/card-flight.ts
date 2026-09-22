import { cardPresentation, ease, EXPAND_DURATION, mix, out, poseMix, type Pose } from './ranking-motion.ts';

/** Unfold the real card from its leaderboard row inside a stationary layout slot.
 * The whole artwork scales with the surface; none of its content moves independently.
 * At rest, geometry resolves to the card's ordinary styles without a handoff.
 */
export function cardFlight(source: Pose, target: Pose, elapsed: number, mobile = false, reduced = false) {
  const progress = out(elapsed / EXPAND_DURATION), pose = poseMix(source, target, progress);
  const presentation = cardPresentation(elapsed, mobile, reduced);
  const artwork = ease(progress / .24);
  return {
    '--card-flight-visible': elapsed >= 0 ? 'visible' : 'hidden',
    '--card-flight-x': progress === 1 ? '0px' : `${pose.x - target.x}px`,
    '--card-flight-y': progress === 1 ? '0px' : `${pose.y - target.y}px`,
    '--card-flight-width': progress === 1 ? '100%' : `${pose.w}px`,
    '--card-flight-height': progress === 1 ? '100%' : `${pose.h}px`,
    '--card-flight-radius': `${mix(10, 20, progress)}px`,
    '--card-flight-rotate-x': `${presentation.rotateX}deg`, '--card-flight-rotate-y': `${presentation.rotateY}deg`,
    '--card-flight-artwork-opacity': String(artwork),
    '--card-flight-background': `color-mix(in srgb, #fff ${artwork * 100}%, var(--rv-selection-surface))`,
    '--card-flight-light-opacity': String(presentation.lightOpacity), '--card-flight-light-x': `${presentation.lightX}%`,
  };
}

import { useEffect, useState } from 'react';
import RankingJourney from './RankingJourney';
import ResultStage from './ResultStage';
import { DEBUG_CHANNEL, DEFAULT_DEBUG, debugResult, debugTimeline, validDebugSettings } from './motion-debug';

const idle = () => {};
export default function MotionPreview() {
  const [settings, setSettings] = useState(DEFAULT_DEBUG);
  const result = debugResult(settings.scenario);
  const timeline = debugTimeline(settings.time, settings.responseAt, result, settings.reducedMotion);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== window.parent || event.data?.channel !== DEBUG_CHANNEL) return;
      if (event.data.ping) window.parent.postMessage({ channel: DEBUG_CHANNEL, ready: true }, window.location.origin);
      if (validDebugSettings(event.data.settings)) setSettings(event.data.settings);
    };
    window.addEventListener('message', receive);
    window.parent.postMessage({ channel: DEBUG_CHANNEL, ready: true }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);
  const command = (action: string) => window.parent.postMessage({ channel: DEBUG_CHANNEL, action }, window.location.origin);
  return <section className="rv-stage is-result has-journey rv-motion-preview" data-debug-phase={timeline.phase} data-debug-time={settings.time.toFixed(2)}>
    <RankingJourney key={settings.scenario} result={timeline.available ? result : null}
      playback={{ prelude: timeline.prelude, reveal: timeline.reveal, reducedMotion: settings.reducedMotion }}
      onComplete={() => command('complete')} onCancel={() => command('reset')} />
    <div className="rv-journey-destination is-covered" inert aria-hidden={!timeline.complete || undefined}>
      <div className="rv-result"><div className="rv-result-hero"><div className="wrap">
        <ResultStage key={settings.scenario} result={result} ready={false} reveal={false} presenting={!timeline.complete} onImprove={idle} />
      </div></div></div>
    </div>
  </section>;
}

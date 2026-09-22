import { useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipBack, SkipForward } from 'lucide-react';
import { DEBUG_CHANNEL, DEBUG_SCENARIOS, DEFAULT_DEBUG, debugResult, debugTimeline, type DebugSettings } from './motion-debug';

export default function MotionDebugPanel() {
  const [settings, setSettings] = useState<DebugSettings>(DEFAULT_DEBUG);
  const [playing, setPlaying] = useState(false), [rate, setRate] = useState(1), [width, setWidth] = useState('desktop');
  const [zoom, setZoom] = useState('fit'), [area, setArea] = useState({ width: 1200, height: 600 });
  const preview = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false), [responseMode, setResponseMode] = useState('20');
  const frame = useRef<HTMLIFrameElement>(null), latest = useRef(settings);
  latest.current = settings;
  const result = debugResult(settings.scenario), timeline = debugTimeline(settings.time, settings.responseAt, result, settings.reducedMotion);
  const duration = Number.isFinite(timeline.end) ? timeline.end : 45;
  const device = width === 'desktop' ? { width: 1352, height: 889 } : { width: Number(width), height: width === '360' ? 800 : 844 };
  const scale = zoom === 'fit' ? Math.min(1, (area.width - 16) / device.width, (area.height - 16) / device.height) : 1;
  const reset = (patch: Partial<DebugSettings> = {}) => { setPlaying(false); setSettings(old => ({ ...old, time: 0, responseAt: responseMode === 'manual' ? null : Number(responseMode), ...patch })); };
  const seek = (time: number) => { setPlaying(false); setSettings(old => ({ ...old, time: Math.max(0, Math.min(duration, time)) })); };
  const changeViewport = (value: string) => { setPlaying(false); setReady(false); setWidth(value); };
  const changeZoom = (value: string) => { setPlaying(false); setReady(false); setZoom(value); };

  useEffect(() => {
    const node = preview.current; if (!node) return;
    const measure = () => setArea({ width: node.clientWidth, height: node.clientHeight });
    measure(); const observer = new ResizeObserver(measure); observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== DEBUG_CHANNEL) return;
      if (event.data.ready) {
        setReady(true);
        frame.current?.contentWindow?.postMessage({ channel: DEBUG_CHANNEL, settings: latest.current }, window.location.origin);
      }
      if (event.data.action === 'reset') { setPlaying(false); setSettings(old => ({ ...old, time: 0 })); }
      if (event.data.action === 'complete') {
        setPlaying(false);
        setSettings(old => ({ ...old, time: debugTimeline(old.time, old.responseAt, debugResult(old.scenario), old.reducedMotion).end }));
      }
    };
    window.addEventListener('message', receive);
    // The SSR iframe may finish before this island hydrates. Either side can
    // initiate the handshake, so the controls never stay stuck in Loading.
    frame.current?.contentWindow?.postMessage({ channel: DEBUG_CHANNEL, ping: true }, window.location.origin);
    return () => window.removeEventListener('message', receive);
  }, []);
  useEffect(() => { if (ready) frame.current?.contentWindow?.postMessage({ channel: DEBUG_CHANNEL, settings }, window.location.origin); }, [settings, ready]);
  useEffect(() => {
    if (!playing || !ready) return;
    let id = 0, previous = performance.now();
    const tick = (now: number) => {
      const delta = document.hidden ? 0 : Math.min((now - previous) / 1000, .06) * rate;
      previous = now;
      setSettings(old => ({ ...old, time: Math.min(duration, old.time + delta) }));
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [playing, rate, duration, ready]);
  useEffect(() => { if (settings.time >= duration) setPlaying(false); }, [settings.time, duration]);

  return <main className="rv-motion-lab">
    <header className="rv-lab-heading"><div><p>RECRUITER'S VIEW / MOTION LAB</p><h1>Follow the same card.</h1></div><a href="/">Open campaign ↗</a></header>
    <div ref={preview} className="rv-lab-preview" data-viewport={width}>
      <div className="rv-lab-device" style={{ width: device.width * scale, height: device.height * scale }}><iframe key={`${width}-${zoom}`} ref={frame} src="/motion-preview/" title="Ranking animation preview" style={{ width: device.width, height: device.height, transform: `scale(${scale})` }} onLoad={() => {
        frame.current?.contentWindow?.postMessage({ channel: DEBUG_CHANNEL, ping: true, settings: latest.current }, window.location.origin);
      }} /></div>
      {!ready && <p className="rv-lab-loading" role="status">Loading preview…</p>}
    </div>
    <section className="rv-lab-panel" aria-label="Animation debugging controls">
      <div className="rv-lab-transport">
        <button className="rv-lab-play" disabled={!ready} onClick={() => { if (settings.time >= duration) reset(); setPlaying(value => !value); }}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? 'Pause' : 'Play'}</button>
        <button onClick={() => { reset(); setPlaying(true); }} disabled={!ready}><RotateCcw size={15} />Replay</button>
        <button aria-label="Previous frame" title="Previous frame (1/60 s)" onClick={() => seek(settings.time - 1 / 60)}><SkipBack size={16} /></button>
        <button aria-label="Next frame" title="Next frame (1/60 s)" onClick={() => seek(settings.time + 1 / 60)}><SkipForward size={16} /></button>
        <label className="rv-lab-rate">Speed<select aria-label="Playback speed" value={rate} onChange={event => setRate(Number(event.target.value))}>{[.25, .5, 1, 2].map(value => <option key={value} value={value}>{value}×</option>)}</select></label>
        <div className="rv-lab-state"><strong>{timeline.phase}</strong><span>{timeline.available ? 'Mock result ready' : 'Waiting for mock response'}</span></div>
        <output aria-label="Playback time">{settings.time.toFixed(2)} <span>/ {duration.toFixed(2)} s</span></output>
      </div>
      <input className="rv-lab-timeline" aria-label="Animation timeline" type="range" min="0" max={duration} step="0.01" value={settings.time} onChange={event => seek(Number(event.target.value))} />
      <nav className="rv-lab-chapters" aria-label="Animation stages">{timeline.chapters.map(chapter => <button key={chapter.label} disabled={!Number.isFinite(chapter.time)} onClick={() => seek(chapter.time)}>{chapter.label}</button>)}</nav>
      <div className="rv-lab-options">
        <label>Result<select aria-label="Mock ranking result" value={settings.scenario} onChange={event => reset({ scenario: event.target.value })}>{DEBUG_SCENARIOS.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        <label>Response<select aria-label="Mock response timing" value={responseMode} onChange={event => { const value = event.target.value; setResponseMode(value); reset({ responseAt: value === 'manual' ? null : Number(value) }); }}>
          <option value="0">Immediately</option><option value="1.88">Current mock · 1.9 s</option><option value="15">After 15 s</option><option value="20">After 20 s</option><option value="35">Slow · 35 s</option><option value="manual">Manual</option>
        </select></label>
        <button className="rv-lab-return" disabled={timeline.available} onClick={() => setSettings(old => ({ ...old, responseAt: old.time }))}>Return result now</button>
        <label>Viewport<select aria-label="Preview viewport" value={width} onChange={event => changeViewport(event.target.value)}><option value="desktop">Desktop</option><option value="360">Mobile · 360px</option><option value="390">Mobile · 390px</option></select></label>
        <label>Zoom<select aria-label="Preview zoom" value={zoom} onChange={event => changeZoom(event.target.value)}><option value="fit">Fit</option><option value="actual">100%</option></select></label>
        <label className="rv-lab-checkbox"><input type="checkbox" checked={settings.reducedMotion} onChange={event => reset({ reducedMotion: event.target.checked })} />Reduced motion</label>
      </div>
      <p className="rv-lab-note">Real page components · Mock data · Drag the timeline to inspect transitions. Mobile previews scroll independently.</p>
    </section>
  </main>;
}

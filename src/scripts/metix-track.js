/* Metix event tracking — a dependency-free port of the homepage repo's
   BatchTracker SDK (app/sdk/BatchTracker.ts + app/api/tracker.ts), adapted from
   React/Next to this Astro static site as plain JS.

   One sink, driven by one track() call:
     BatchTracker — queues SPMID-style events and POSTs them in batches to the
     same-origin collection API (/api/track/collect/batch). Mirrors the
     reference config (maxBatchSize / flushInterval / sampleRate) and flush
     triggers (interval, queue full, page hide, page unload).

   Events are deliberately NOT forwarded to Microsoft Clarity. Clarity keeps its
   own native session recording (wired in BaseLayout), but mirroring our custom
   events/tags there would explode Clarity's event/tag cardinality (page-specific
   eventIds + high-cardinality values like URLs / referrers). Clarity stays
   recording-only; structured analytics live in the backend sink.

   Network sends only reach out on go.metix.ai.
   Local/preview builds queue-and-drop. Marketing attribution from
   metix-attribution.js is merged onto every event. Tracking is best-effort and
   must never block or break the page. */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ config */

  const BUSINESS_ID = "homepage"; // BusinessId.HOMEPAGE
  const API = {
    collect: "/api/track/collect",
    batch: "/api/track/collect/batch",
    anonymous: "/api/track/anonymous/collect",
  };
  // Matches TrackerProvider's live configuration (not BatchTracker's raw defaults).
  const DEFAULTS = { maxBatchSize: 5, flushInterval: 30000, sampleRate: 1 };
  const TRACK_ENABLED_HOSTS = ["go.metix.ai"];

  const AUTH_TOKEN_COOKIE = "metix_auth_at"; // AUTH_COOKIE_NAME_ACCESS_TOKEN
  const AUTH_REFRESH_COOKIE = "metix_auth_rt";
  const AUTH_USER_COOKIE = "metix_auth_user";
  const ATTRIBUTION_COOKIE = "metix_attribution";
  const ATTRIBUTION_VERSION = 1;
  const ATTRIBUTION_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;
  const ATTRIBUTION_KEYS = [
    "utm_source",
    "utm_medium",
    "utm_campaign",
    "utm_term",
    "utm_content",
    "li_campaign_id",
    "gclid",
    "gbraid",
    "wbraid",
    "gad_source",
    "gad_campaignid",
    "gclsrc",
    "fbclid",
    "msclkid",
  ];
  const SESSION_STORAGE_KEY = "metix_track_session";
  const SAMPLE_STORAGE_KEY = "metix_track_sample";
  const VISITOR_STORAGE_KEY = "metix_track_visitor";

  const MAX_EVENT_NAME_LENGTH = 128;
  const MAX_PROP_KEY_LENGTH = 64;
  const MAX_PROP_VALUE_LENGTH = 255;
  const MAX_PROPS_PER_EVENT = 24;
  const MAX_QUEUE_LENGTH = 100;

  // Ported enums (app/api/tracker.ts), frozen and exposed on window.metix.
  const EventType = Object.freeze({
    show: "show",
    click: "click",
    page_view: "page_view",
    leave: "leave",
    submit: "submit",
    scroll: "scroll",
    play: "play",
    pause: "pause",
    system: "system",
    custom: "custom",
    success: "success",
    open: "open",
    reply: "reply",
    start: "start",
    error: "error",
  });
  const PageId = Object.freeze({
    root: "go-rank-root",
    result: "go-rank-result",
    share: "go-rank-share",
    improve: "go-rank-improve",
    opportunities: "go-rank-opportunities",
  });
  let activeScene = null;
  let lastPageId = null;
  const PositionId = Object.freeze({ page: "page" });
  const ModuleId = Object.freeze({
    upload_resume: "upload-resume",
    chat: "chat",
    report: "report",
    job_list: "job-list",
    job_list_apply: "job-list-apply",
    content: "content",
  });

  /* ----------------------------------------------------------------- helpers */

  function isTrackEnabledHost() {
    try {
      return TRACK_ENABLED_HOSTS.indexOf(window.location.hostname) !== -1;
    } catch (_) {
      return false;
    }
  }

  function getCookieValue(name) {
    try {
      const prefix = name + "=";
      const entry = document.cookie
        .split(";")
        .map(function (part) {
          return part.trim();
        })
        .find(function (part) {
          return part.indexOf(prefix) === 0;
        });
      if (!entry) return null;
      return decodeURIComponent(entry.slice(prefix.length));
    } catch (_) {
      return null;
    }
  }

  function getAuthToken() {
    return getCookieValue(AUTH_TOKEN_COOKIE);
  }

  function hasValidJson(value, requireUserUuid) {
    if (!value) return false;
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== "object") return false;
      return !requireUserUuid ||
        (typeof parsed.userUuid === "string" && parsed.userUuid.trim() !== "");
    } catch (_) {
      return false;
    }
  }

  // Match metix-auth.js semantics: a cookie session is recoverable with user
  // state + refresh token even while its access token is absent/expired.
  function isLoggedIn() {
    try {
      const cookieUser = getCookieValue(AUTH_USER_COOKIE);
      const cookieRefresh = getCookieValue(AUTH_REFRESH_COOKIE);
      if (cookieUser || getAuthToken() || cookieRefresh) {
        return Boolean(cookieRefresh && hasValidJson(cookieUser, true));
      }

      const store = window.localStorage;
      return Boolean(
        store.getItem("at") &&
        store.getItem("rt") &&
        hasValidJson(store.getItem("user"), false),
      );
    } catch (_) {
      return false;
    }
  }

  function readAttribution() {
    try {
      const raw = getCookieValue(ATTRIBUTION_COOKIE);
      if (!raw) return { utm_source: "direct" };
      const stored = JSON.parse(raw);
      const now = Date.now();
      if (
        stored.version !== ATTRIBUTION_VERSION ||
        !Number.isFinite(stored.timestamp) ||
        stored.timestamp <= 0 ||
        stored.timestamp > now ||
        now - stored.timestamp >= ATTRIBUTION_EXPIRY_MS
      ) {
        return { utm_source: "direct" };
      }
      const data = stored && typeof stored === "object" ? stored.data : null;
      if (!data || typeof data !== "object") return { utm_source: "direct" };
      const result = {};
      ATTRIBUTION_KEYS.forEach(function (key) {
        const value = data[key];
        if (typeof value !== "string") return;
        const clean = value.trim().slice(0, MAX_PROP_VALUE_LENGTH);
        if (clean) result[key] = clean;
      });
      return Object.keys(result).length > 0 ? result : { utm_source: "direct" };
    } catch (_) {
      return { utm_source: "direct" };
    }
  }

  function getSessionId() {
    try {
      const store = window.sessionStorage;
      let id = store.getItem(SESSION_STORAGE_KEY);
      if (!id) {
        id = "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
        store.setItem(SESSION_STORAGE_KEY, id);
      }
      return id;
    } catch (_) {
      return null;
    }
  }

  function getVisitorId() {
    try {
      const store = window.localStorage;
      let id = store.getItem(VISITOR_STORAGE_KEY);
      if (!id) {
        id = "v_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 10);
        store.setItem(VISITOR_STORAGE_KEY, id);
      }
      return id;
    } catch (_) {
      return null;
    }
  }

  function getSamplingDecision(rate) {
    const numericRate = Number(rate);
    const normalizedRate = Number.isFinite(numericRate)
      ? Math.max(0, Math.min(1, numericRate))
      : DEFAULTS.sampleRate;
    try {
      const store = window.sessionStorage;
      const stored = JSON.parse(store.getItem(SAMPLE_STORAGE_KEY) || "null");
      if (
        stored &&
        stored.rate === normalizedRate &&
        typeof stored.sampled === "boolean"
      ) {
        return { rate: normalizedRate, sampled: stored.sampled };
      }
      const sampled = Math.random() < normalizedRate;
      store.setItem(
        SAMPLE_STORAGE_KEY,
        JSON.stringify({ rate: normalizedRate, sampled: sampled }),
      );
      return { rate: normalizedRate, sampled: sampled };
    } catch (_) {
      // When sessionStorage is blocked, derive a stable fallback from the
      // persistent visitor ID so full-page navigation still keeps one cohort.
      const visitorId = getVisitorId();
      if (visitorId) {
        let hash = 2166136261;
        for (let index = 0; index < visitorId.length; index += 1) {
          hash ^= visitorId.charCodeAt(index);
          hash = Math.imul(hash, 16777619);
        }
        return {
          rate: normalizedRate,
          sampled: (hash >>> 0) / 4294967296 < normalizedRate,
        };
      }
      return { rate: normalizedRate, sampled: Math.random() < normalizedRate };
    }
  }

  function coerceValue(value) {
    if (typeof value === "string") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
    if (typeof value === "boolean") return String(value);
    return null;
  }

  function normalizeName(name) {
    if (typeof name !== "string") return null;
    const clean = name.trim().slice(0, MAX_EVENT_NAME_LENGTH);
    return clean || null;
  }

  function normalizeProps(props) {
    const normalized = {};
    if (Object.prototype.toString.call(props) !== "[object Object]") return normalized;
    let count = 0;
    for (const rawKey of Object.keys(props)) {
      if (count >= MAX_PROPS_PER_EVENT) break;
      const key = rawKey.trim().slice(0, MAX_PROP_KEY_LENGTH);
      if (!key) continue;
      const value = coerceValue(props[rawKey]);
      if (value === null || value === "") continue;
      normalized[key] = value.slice(0, MAX_PROP_VALUE_LENGTH);
      count += 1;
    }
    return normalized;
  }

  const CAMPAIGN_BASE = "/recruiters-view";
  function campaignSegments(pathname) {
    const segments = (pathname || "/").split("/").filter(Boolean);
    return segments[0] === "recruiters-view" ? segments.slice(1) : null;
  }

  function sceneForPath(pathname) {
    const segment = campaignSegments(pathname)?.[0];
    return Object.prototype.hasOwnProperty.call(PageId, segment) ? segment : "root";
  }

  function safePath(pathname) {
    const segments = campaignSegments(pathname);
    if (!segments) return "/:unknown";
    if (!segments.length) return CAMPAIGN_BASE + "/";
    if (!Object.prototype.hasOwnProperty.call(PageId, segments[0])) return "/:unknown";
    return CAMPAIGN_BASE + "/" + segments[0] + (segments.length > 1 ? "/:handle" : "");
  }

  // URLs can contain profile names, email addresses and queries. Retain only
  // external origins or canonical campaign routes, never raw URL text.
  function safeUrl(value) {
    try {
      const url = new URL(value, window.location.origin || "https://go.metix.ai");
      if (url.protocol !== "https:" && url.protocol !== "http:") return "";
      if (url.hostname === window.location.hostname) {
        const path = safePath(url.pathname);
        return value.charAt(0) === "/" && value.charAt(1) !== "/" ? path : url.origin + path;
      }
      return url.origin;
    } catch (_) {
      return "";
    }
  }

  function detectPageId() {
    return PageId[activeScene || sceneForPath(window.location.pathname)];
  }

  /* ------------------------------------------------- backend collection layer */

  function post(url, payload, keepalive) {
    try {
      if (!isTrackEnabledHost()) return; // backend only exists behind allowed-host ingress
      const body = JSON.stringify(payload);
      const headers = { "Content-Type": "application/json" };
      const token = getAuthToken();
      if (token) headers.Authorization = "Bearer " + token;
      return window
        .fetch(url, {
          method: "POST",
          headers: headers,
          body: body,
          keepalive: keepalive === true,
          credentials: "same-origin",
          referrerPolicy: "no-referrer",
        })
        .catch(function () {
          // Best-effort: a failed collection request must never surface.
        });
    } catch (_) {
      return undefined;
    }
  }

  /* --------------------------------------------------------------- BatchTracker */

  function BatchTracker(options) {
    options = options || {};
    this.queue = [];
    this.timer = null;
    this.maxBatchSize = options.maxBatchSize || DEFAULTS.maxBatchSize;
    this.flushInterval = options.flushInterval || DEFAULTS.flushInterval;
    this.businessId = options.businessId || BUSINESS_ID;
    const sampling = getSamplingDecision(
      options.sampleRate == null ? DEFAULTS.sampleRate : options.sampleRate,
    );
    this.sampleRate = sampling.rate;
    this.started = false;
    this.isFlushing = false;
    this.beforeUnloadHandler = null;
    this.visibilityChangeHandler = null;

    // Persist the decision in sessionStorage so full-page navigation cannot
    // split one funnel across sampled and unsampled pages.
    this.isSampled = sampling.sampled;
  }

  BatchTracker.prototype.start = function () {
    if (typeof window === "undefined") return;
    if (!this.isSampled || this.started) return;
    this.started = true;

    const self = this;
    try {
      this.timer = window.setInterval(function () {
        void self.flush();
      }, this.flushInterval);
    } catch (_) {
      this.timer = null;
    }

    this.beforeUnloadHandler = function () {
      void self.flush(true);
    };
    this.visibilityChangeHandler = function () {
      try {
        if (document.visibilityState === "hidden") void self.flush(true);
      } catch (_) {
        // ignore
      }
    };
    try {
      window.addEventListener("beforeunload", this.beforeUnloadHandler);
      document.addEventListener("visibilitychange", this.visibilityChangeHandler);
    } catch (_) {
      // environments without addEventListener still flush on interval / size
    }
  };

  BatchTracker.prototype.track = function (event, forceFlush) {
    if (!this.isSampled) return;
    const enriched = Object.assign({}, event, {
      timestamp: Date.now(),
      businessId: this.businessId,
    });
    if (!enriched.sessionId) {
      const sid = getSessionId();
      if (sid) enriched.sessionId = sid;
    }
    this.queue.push(enriched);
    if (this.queue.length > MAX_QUEUE_LENGTH) {
      this.queue.splice(0, this.queue.length - MAX_QUEUE_LENGTH);
    }
    if (forceFlush === true) {
      void this.flush(true);
    } else if (this.queue.length >= this.maxBatchSize) {
      void this.flush();
    }
  };

  BatchTracker.prototype.trackOnce = function (event) {
    post(
      API.collect,
      Object.assign({}, event, { timestamp: Date.now(), businessId: this.businessId }),
    );
  };

  BatchTracker.prototype.trackOnceAnonymous = function (event) {
    post(
      API.anonymous,
      Object.assign({}, event, { timestamp: Date.now(), businessId: this.businessId }),
    );
  };

  BatchTracker.prototype.flush = function (force) {
    // Skip re-entrant flushes so the interval and a manual/size flush never
    // double-send the same queue. A forced conversion flush is the exception:
    // it snapshots only events queued after the in-flight batch and sends them
    // in parallel with keepalive so navigation cannot strand the conversion.
    if (this.isFlushing) {
      if (force === true && this.queue.length > 0) {
        const forcedQueue = this.queue.slice();
        this.queue = [];
        return Promise.resolve(
          post(API.batch, { batchTrackEventList: forcedQueue }, true),
        );
      }
      return Promise.resolve();
    }
    if (this.queue.length === 0) return Promise.resolve();

    this.isFlushing = true;
    // Copy then clear synchronously so nothing enqueued mid-send is lost or
    // double-counted, and the original array reference is released.
    const queueToSend = this.queue.slice();
    this.queue = [];

    const self = this;
    return Promise.resolve(post(API.batch, { batchTrackEventList: queueToSend }, force === true))
      .catch(function () {
        // On failure we intentionally do NOT re-queue — infinite retries would
        // leak memory. Events are best-effort.
      })
      .then(function () {
        self.isFlushing = false;
        // Note: `force` here only means "send with keepalive" (page hide /
        // unload). We deliberately do NOT stop the interval timer, because a
        // page-hide from a tab switch would otherwise permanently disable
        // periodic flushing while the user is still on the page. Timer teardown
        // lives in destroy(); on a real unload the page is discarded anyway.
      });
  };

  BatchTracker.prototype.destroy = function () {
    if (this.timer) {
      try {
        window.clearInterval(this.timer);
      } catch (_) {
        // ignore
      }
      this.timer = null;
    }
    try {
      if (this.beforeUnloadHandler) {
        window.removeEventListener("beforeunload", this.beforeUnloadHandler);
        this.beforeUnloadHandler = null;
      }
      if (this.visibilityChangeHandler) {
        document.removeEventListener("visibilitychange", this.visibilityChangeHandler);
        this.visibilityChangeHandler = null;
      }
    } catch (_) {
      // ignore
    }
    this.queue = [];
    this.isFlushing = false;
    this.started = false;
  };

  /* --------------------------------------------------- event building + bridge */

  let attribution = {};
  const tracker = new BatchTracker(
    (function () {
      try {
        return window.metix && window.metix.config ? window.metix.config : {};
      } catch (_) {
        return {};
      }
    })(),
  );

  function baseProperties(extra) {
    const props = {};
    try {
      props.path = activeScene && activeScene !== sceneForPath(window.location.pathname)
        ? (activeScene === "root" ? CAMPAIGN_BASE + "/" : CAMPAIGN_BASE + "/" + activeScene)
        : safePath(window.location.pathname);
    } catch (_) {
      props.path = CAMPAIGN_BASE + "/";
    }
    props.campaign = "rank";
    props.scene = activeScene || sceneForPath(window.location.pathname);
    props.is_logged_in = isLoggedIn() ? "true" : "false";
    const visitorId = getVisitorId();
    if (visitorId) props.visitor_id = visitorId;
    Object.assign(props, attribution);
    const custom = normalizeProps(extra);
    for (const key of Object.keys(custom)) {
      if (Object.keys(props).length >= MAX_PROPS_PER_EVENT) break;
      // Public callers may add business dimensions but cannot spoof automatic
      // path/auth/visitor/attribution fields.
      if (
        ATTRIBUTION_KEYS.indexOf(key) === -1 &&
        !Object.prototype.hasOwnProperty.call(props, key)
      ) {
        if (key === "page_title") props[key] = "Metix Rank — " + props.scene;
        else if (key === "target" || key === "referrer") {
          const value = safeUrl(custom[key]);
          if (value) props[key] = value;
        } else props[key] = custom[key];
      }
    }
    return props;
  }

  function eventIdFor(pageId, positionId, name) {
    return tracker.businessId + "." + pageId + "." + positionId + "." + name;
  }

  // Accepts either a string event name or a partial TrackEventReq object and
  // returns a normalized backend event.
  function toEvent(input, props) {
    const pageId = detectPageId();

    if (typeof input === "string") {
      const name = normalizeName(input);
      if (!name) return null;
      const eventType = EventType[name] ? name : EventType.custom;
      return {
        eventId: eventIdFor(pageId, PositionId.page, name),
        pageId: pageId,
        positionId: PositionId.page,
        eventType: eventType,
        properties: baseProperties(props),
      };
    }

    if (Object.prototype.toString.call(input) === "[object Object]") {
      const eventType =
        typeof input.eventType === "string" && input.eventType
          ? input.eventType
          : EventType.custom;
      const shortName = normalizeName(input.name) || eventType;
      const event = {
        eventId: eventIdFor(pageId, PositionId.page, shortName),
        pageId: pageId,
        positionId: PositionId.page,
        eventType: eventType,
        properties: baseProperties(input.properties),
      };
      if (input.moduleId) event.moduleId = input.moduleId;
      return event;
    }

    return null;
  }

  function track(input, props, forceFlush) {
    try {
      // Sampling is a per-session decision for the backend sink.
      if (!tracker.isSampled) return;
      const isPageView = input === "page_view" ||
        (input && typeof input === "object" && input.eventType === EventType.page_view);
      if (isPageView) {
        const extra = typeof input === "string" ? props : input.properties;
        if (extra && Object.prototype.hasOwnProperty.call(PageId, extra.scene)) activeScene = extra.scene;
        const pageId = detectPageId();
        if (pageId === lastPageId) return;
        lastPageId = pageId;
      }
      const event = toEvent(input, props);
      if (!event) return;
      tracker.track(event, forceFlush === true); // → backend batch (the only sink)
      // NOTE: events are deliberately NOT forwarded to Microsoft Clarity — see the
      // file header. Clarity keeps its own native session recording; mirroring our
      // custom events/tags there would explode Clarity's event/tag cardinality.
    } catch (_) {
      // Tracking is best-effort and must never throw into caller code.
    }
  }

  /* ----------------------------------------------------- declarative bindings */

  function readDeclaredProps(el) {
    const props = {};
    try {
      const dataset = el.dataset || {};
      for (const key of Object.keys(dataset)) {
        if (key === "track" || key === "trackImmediate") continue;
        if (key.indexOf("track") !== 0) continue;
        const rest = key.slice("track".length);
        // Only "data-track-*" maps here: its dataset key is "track" + an
        // uppercase segment (e.g. trackLocation). Skip lookalikes such as
        // "tracking" whose next char is lowercase.
        const head = rest.charAt(0);
        if (!head || head === head.toLowerCase()) continue;
        const propKey = rest
          .replace(/([A-Z])/g, "_$1")
          .toLowerCase()
          .replace(/^_/, "");
        props[propKey] = dataset[key];
      }
    } catch (_) {
      // dataset unavailable — no props
    }
    return props;
  }

  // Any click on a cross-origin http(s) link that ISN'T explicitly instrumented
  // is auto-tracked as `outbound`, so in-content external links (about, blog,
  // faq, careers…) are covered without hand-tagging each one. Links that already
  // carry data-track are handled by the branch above and never reach here.
  function autoOutbound(target) {
    try {
      if (!target || typeof target.closest !== "function") return;
      const a = target.closest("a[href]");
      if (!a) return;
      // The anchor resolves protocol/hostname against the document; only real
      // cross-origin http(s) navigations count (skip mailto/tel, hashes, same-site).
      const proto = a.protocol;
      if (proto !== "http:" && proto !== "https:") return;
      if (!a.hostname) return;
      const linkHost = a.hostname.toLowerCase();
      const pageHost = window.location.hostname.toLowerCase();
      const metixHosts = ["go.metix.ai", "metix.ai", "www.metix.ai"];
      if (
        linkHost === pageHost ||
        (metixHosts.indexOf(linkHost) !== -1 &&
          metixHosts.indexOf(pageHost) !== -1)
      ) {
        return;
      }
      track({ eventType: EventType.click, name: "outbound", properties: { location: "content", target: a.href } });
    } catch (_) {
      // never interfere with the navigation
    }
  }

  function onClick(event) {
    try {
      const target = event.target;
      if (!target || typeof target.closest !== "function") return;
      const el = target.closest("[data-track]");
      if (!el) {
        autoOutbound(target);
        return;
      }
      const name = el.getAttribute("data-track");
      if (!name) return;
      const props = readDeclaredProps(el);
      // Capture the resolved destination, including auth-driven href rewrites.
      if (!props.target && typeof el.getAttribute === "function") {
        const href = el.getAttribute("href");
        if (href) props.target = href;
      }
      const forceFlush =
        name === "signup" ||
        name === "contact_sales" ||
        name === "apply" ||
        el.getAttribute("data-track-immediate") === "true";
      track(
        { eventType: EventType.click, name: name, properties: props },
        undefined,
        forceFlush,
      );
      // These events initiate an immediate navigation and are the primary
      // conversion signals. Send now with keepalive instead of waiting for the
      // size/interval/unload flush.
    } catch (_) {
      // Never let a tracking click handler interfere with the real interaction.
    }
  }

  // Fire a one-shot `show` event when a [data-track-show] element scrolls into
  // view (e.g. pricing plan cards). The attribute value is the event name;
  // other data-track-* attributes become properties.
  function onExposure(el) {
    try {
      const name = el.getAttribute("data-track-show");
      if (!name) return;
      const props = readDeclaredProps(el);
      delete props.show; // data-track-show carries the event name, not a property
      track({ eventType: EventType.show, name: name, properties: props });
    } catch (_) {
      // exposure tracking is best-effort
    }
  }

  /* -------------------------------------------------------------------- init */

  function init() {
    if (window.metix.ready) return;
    attribution = readAttribution();
    tracker.start();

    try {
      document.addEventListener("click", onClick, { capture: true, passive: true });
    } catch (_) {
      // programmatic track() still works without delegation
    }

    // Exposure tracking: one-shot `show` for [data-track-show] elements as they
    // enter the viewport. Dynamic (React) surfaces track exposure programmatically.
    try {
      if (typeof IntersectionObserver === "function" && document.querySelectorAll) {
        const showEls = document.querySelectorAll("[data-track-show]");
        if (showEls.length) {
          const io = new IntersectionObserver(
            function (entries) {
              entries.forEach(function (entry) {
                const raw = entry.target.getAttribute("data-track-show-threshold");
                const need = raw ? Number(raw) : 0.5;
                if (!(entry.intersectionRatio >= need)) return;
                io.unobserve(entry.target);
                onExposure(entry.target);
              });
            },
            { threshold: [0, 0.15, 0.5, 1] },
          );
          showEls.forEach(function (el) {
            io.observe(el);
          });
        }
      }
    } catch (_) {
      // no IntersectionObserver / querySelectorAll — skip exposure tracking
    }

    // Baseline page_view so every load is represented even without a CTA.
    // page_view carries type-specific page_title/referrer (docs/tracking-spec.md §4.1.3);
    // empty values (e.g. a direct visit's referrer) are dropped by normalizeProps.
    const pageViewProps = {};
    try {
      pageViewProps.page_title = "Metix Rank — " + (activeScene || sceneForPath(window.location.pathname));
      if (document.referrer) pageViewProps.referrer = document.referrer;
    } catch (_) {
      // document access failed — a bare page_view is still fine
    }
    track("page_view", pageViewProps);
    window.metix.ready = true;
    try { window.dispatchEvent(new Event("metix:ready")); } catch (_) {}
  }

  // Expose the public surface synchronously so early callers never miss.
  window.metix = window.metix || {};
  window.metix.track = track;
  window.metix.tracker = tracker;
  window.metix.EventType = EventType;
  window.metix.PageId = PageId;
  window.metix.PositionId = PositionId;
  window.metix.ModuleId = ModuleId;

  try {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init, { once: true });
    } else {
      init();
    }
  } catch (_) {
    // If wiring init fails, window.metix.track still works for manual calls.
  }
})();

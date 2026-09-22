(function () {
  "use strict";

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
  const COOKIE_NAME = "metix_attribution";
  const COOKIE_VERSION = 1;
  const MAX_VALUE_LENGTH = 255;
  const EXPIRY_SECONDS = 14 * 24 * 60 * 60;
  const EXPIRY_MS = EXPIRY_SECONDS * 1000;

  function normalizeData(candidate) {
    if (Object.prototype.toString.call(candidate) !== "[object Object]") {
      return null;
    }

    const normalized = {};
    ATTRIBUTION_KEYS.forEach((key) => {
      const value = candidate[key];
      if (typeof value !== "string") return;
      const clean = value.trim().slice(0, MAX_VALUE_LENGTH);
      if (clean) normalized[key] = clean;
    });

    return Object.keys(normalized).length ? normalized : null;
  }

  function readQueryAttribution() {
    const params = new URLSearchParams(window.location.search);
    const candidate = {};

    ATTRIBUTION_KEYS.forEach((key) => {
      const value = params.get(key);
      if (value !== null) candidate[key] = value;
    });

    return normalizeData(candidate);
  }

  function readCookieValue() {
    const prefix = `${COOKIE_NAME}=`;
    const cookie = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));

    return cookie ? cookie.slice(prefix.length) : null;
  }

  function readValidAttribution(now) {
    try {
      const raw = readCookieValue();
      if (!raw) return null;

      const stored = JSON.parse(decodeURIComponent(raw));
      if (
        stored.version !== COOKIE_VERSION ||
        !Number.isFinite(stored.timestamp) ||
        stored.timestamp <= 0 ||
        stored.timestamp > now ||
        now - stored.timestamp >= EXPIRY_MS
      ) {
        return null;
      }

      const data = normalizeData(stored.data);
      if (!data) return null;

      const candidateKeys = Object.keys(stored.data);
      const dataKeys = Object.keys(data);
      const isCanonical =
        candidateKeys.length === dataKeys.length &&
        dataKeys.every((key) => stored.data[key] === data[key]);

      return {
        version: COOKIE_VERSION,
        data,
        timestamp: stored.timestamp,
        isCanonical,
      };
    } catch (_) {
      return null;
    }
  }

  function isProductionHost(hostname) {
    return hostname === "go.metix.ai";
  }

  function writeAttribution(data, timestamp, now = timestamp) {
    const expiresAt = timestamp + EXPIRY_MS;
    const remainingSeconds = Math.max(
      0,
      Math.ceil((expiresAt - now) / 1000),
    );
    const payload = {
      version: COOKIE_VERSION,
      data,
      timestamp,
    };
    const attributes = [
      `${COOKIE_NAME}=${encodeURIComponent(JSON.stringify(payload))}`,
      "Path=/",
      `Max-Age=${remainingSeconds}`,
      `Expires=${new Date(expiresAt).toUTCString()}`,
      "SameSite=Lax",
    ];

    if (window.location.protocol === "https:") attributes.push("Secure");
    if (isProductionHost(window.location.hostname)) {
      attributes.push("Domain=metix.ai");
    }

    document.cookie = attributes.join("; ");
  }

  try {
    const now = Date.now();
    const current = readQueryAttribution();

    if (current) {
      writeAttribution(current, now);
    } else {
      const stored = readValidAttribution(now);
      if (!stored) {
        writeAttribution({ utm_source: "direct" }, now);
      } else if (!stored.isCanonical) {
        writeAttribution(stored.data, stored.timestamp, now);
      }
    }
  } catch (_) {
    // Attribution is best-effort and must never block the page.
  }
})();

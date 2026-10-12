(function () {
  "use strict";

  const ATTRIBUTION_KEYS = [
    "src",
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

    // 社交分享链接可用 src 简写；同时补齐 utm_source 供后续归因使用，埋点保留 src。
    // 显式传入的非空 utm_source 优先。
    if (!candidate.utm_source || !candidate.utm_source.trim()) {
      const source = params.get("src");
      if (source !== null) candidate.utm_source = source;
    }

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
    // 归因失败时忽略错误，不能阻塞页面。
  }

  function decorateMainSiteLinks() {
    const stored = readValidAttribution(Date.now());
    if (!stored) return;

    document.querySelectorAll("a[href]").forEach((link) => {
      try {
        const href = link.getAttribute("href");
        const url = new URL(href, document.baseURI);
        if (
          (url.protocol !== "https:" && url.protocol !== "http:") ||
          (url.hostname !== "metix.ai" && url.hostname !== "www.metix.ai")
        ) {
          return;
        }

        // 条款和隐私政策链接不附加归因参数。
        const path = url.pathname.replace(/\/$/, "");
        if (path === "/terms-of-service" || path === "/privacy-policy") return;

        let changed = false;
        Object.keys(stored.data).forEach((key) => {
          if (key === "src") return;
          if (!url.searchParams.has(key)) {
            url.searchParams.set(key, stored.data[key]);
            changed = true;
          }
        });
        if (changed) link.setAttribute("href", url.href);
      } catch (_) {
        // 单个链接格式错误不能影响其他链接的归因参数补齐。
      }
    });
  }

  try {
    decorateMainSiteLinks();
    // 为 React 动态渲染或后续修改 href 的链接补齐参数，
    // 同时支持在新标签页打开和直接复制链接。
    if (typeof MutationObserver === "function") {
      const observer = new MutationObserver(decorateMainSiteLinks);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["href"],
      });
    }
  } catch (_) {
    // 链接参数补齐失败时忽略错误，不能阻塞跳转。
  }
})();

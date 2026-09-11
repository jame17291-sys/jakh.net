(() => {
  "use strict";

  const productionApiOrigin = "https://api.riddlearabia.com/api";
  const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);
  const html = document.documentElement;
  const existing = globalThis.RIDDLE_ARABIA_ADMIN_CONFIG || {};
  const localDefault = `${location.protocol}//${location.hostname}:8787/api`;
  const candidate = existing.apiOrigin
    || html.dataset.adminApiOrigin
    || (localHosts.has(location.hostname) ? localDefault : productionApiOrigin);

  function safeApiOrigin(value) {
    try {
      const url = new URL(String(value), location.origin);
      const isLoopback = localHosts.has(url.hostname);
      if (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback)) return productionApiOrigin;
      const pathname = url.pathname.replace(/\/+$/u, "");
      if (pathname !== "/api") return productionApiOrigin;
      return url.href.replace(/\/$/u, "");
    } catch {
      return productionApiOrigin;
    }
  }

  const apiOrigin = safeApiOrigin(candidate);
  const environment = String(existing.environment || html.dataset.adminEnvironment || (
    localHosts.has(location.hostname) ? "local" : "production"
  )).trim().toLowerCase();

  globalThis.RIDDLE_ARABIA_ADMIN_CONFIG = Object.freeze({ apiOrigin, environment });
})();

(() => {
  const enabled = "__CODEY_FAST_CODEX_STARTUP__" === "true";
  const timeoutMs = Math.max(
    250,
    Math.min(Number("__CODEY_STATSIG_TIMEOUT_MS__") || 1500, 5000),
  );
  const existing = window.__codeyFastStartupShield;
  if (existing?.version === 1 && existing.enabled === enabled) return;

  const state = {
    version: 1,
    enabled,
    installed: false,
    active: false,
    timeoutMs,
    protectionWindowMs: 30000,
    statsigFetches: 0,
    statsigTimeouts: 0,
    clientFallbacks: 0,
    clientFailures: 0,
    snapshot() {
      return {
        version: this.version,
        enabled: this.enabled,
        installed: this.installed,
        active: this.active,
        timeoutMs: this.timeoutMs,
        protectionWindowMs: this.protectionWindowMs,
        statsigFetches: this.statsigFetches,
        statsigTimeouts: this.statsigTimeouts,
        clientFallbacks: this.clientFallbacks,
        clientFailures: this.clientFailures,
      };
    },
  };
  window.__codeyFastStartupShield = state;
  if (!enabled || typeof window.fetch !== "function") return;

  const statsigHosts = new Set([
    "ab.chatgpt.com",
    "featureassets.org",
    "prodregistryv2.org",
    "api.statsigcdn.com",
    "statsigapi.net",
    "cloudflare-dns.com",
  ]);
  const patchedClients = new WeakSet();

  const isStatsigRequest = (input) => {
    try {
      const rawUrl = typeof input === "string" ? input : input?.url ?? "";
      return statsigHosts.has(new URL(rawUrl, window.location.href).hostname);
    } catch {
      return false;
    }
  };

  const statsigClients = () => {
    const clients = [];
    const roots = [window.__STATSIG__, globalThis.__STATSIG__];
    for (const root of roots) {
      if (!root || typeof root !== "object") continue;
      try {
        clients.push(root.firstInstance);
      } catch {
      }
      try {
        if (typeof root.instance === "function") clients.push(root.instance());
      } catch {
      }
      try {
        if (root.instances && typeof root.instances === "object") {
          clients.push(...Object.values(root.instances));
        }
      } catch {
      }
    }
    return clients.filter(
      (client, index, array) =>
        client && typeof client === "object" && array.indexOf(client) === index,
    );
  };

  const markClientReady = (client) => {
    try {
      if (client.loadingStatus && client.loadingStatus !== "Ready") {
        client.loadingStatus = "Ready";
      }
    } catch {
    }
    try {
      if (typeof client.$emt === "function") {
        client.$emt({ name: "values_updated" });
      }
    } catch {
    }
  };

  const patchClient = (client) => {
    if (patchedClients.has(client)) return;
    let initializeAsync;
    try {
      initializeAsync = client.initializeAsync;
    } catch {
      return;
    }
    if (typeof initializeAsync !== "function") return;
    const originalInitializeAsync = initializeAsync.bind(client);
    const patchedInitializeAsync = (...args) => {
      if (!state.active) return originalInitializeAsync(...args);
      let fallbackTimer;
      const originalResult = Promise.resolve()
        .then(() => originalInitializeAsync(...args))
        .catch(() => {
          state.clientFailures += 1;
          markClientReady(client);
          return null;
        });
      const fallback = new Promise((resolve) => {
        fallbackTimer = window.setTimeout(() => {
          state.clientFallbacks += 1;
          markClientReady(client);
          resolve(null);
        }, timeoutMs);
      });
      return Promise.race([originalResult, fallback]).finally(() => {
        window.clearTimeout(fallbackTimer);
      });
    };
    try {
      client.initializeAsync = patchedInitializeAsync;
      if (client.initializeAsync === patchedInitializeAsync) patchedClients.add(client);
    } catch {
    }
  };

  const patchStatsigClients = () => {
    for (const client of statsigClients()) patchClient(client);
  };

  const releaseStatsigClients = () => {
    for (const client of statsigClients()) {
      patchClient(client);
      markClientReady(client);
    }
  };

  const originalFetch = window.fetch;
  const patchedFetch = (input, init = undefined) => {
    if (!state.active || !isStatsigRequest(input)) {
      return originalFetch.call(window, input, init);
    }
    state.statsigFetches += 1;

    const controller = new AbortController();
    const upstreamSignal = init?.signal || (
      input && typeof input === "object" ? input.signal : undefined
    );
    const propagateAbort = () => controller.abort();
    if (upstreamSignal) {
      if (upstreamSignal.aborted) propagateAbort();
      else upstreamSignal.addEventListener("abort", propagateAbort, { once: true });
    }
    const timer = window.setTimeout(() => {
      state.statsigTimeouts += 1;
      releaseStatsigClients();
      controller.abort();
    }, timeoutMs);
    const cleanup = () => {
      window.clearTimeout(timer);
      upstreamSignal?.removeEventListener?.("abort", propagateAbort);
    };
    const nextInit = { ...(init || {}), signal: controller.signal };
    try {
      return Promise.resolve(originalFetch.call(window, input, nextInit)).finally(cleanup);
    } catch (error) {
      cleanup();
      throw error;
    }
  };
  patchedFetch.__codeyFastStartupPatched = true;
  window.fetch = patchedFetch;
  state.installed = true;
  state.active = true;

  patchStatsigClients();
  const startedAt = Date.now();
  const clientScanTimer = window.setInterval(() => {
    patchStatsigClients();
    if (Date.now() - startedAt >= 15000) {
      window.clearInterval(clientScanTimer);
    }
  }, 50);
  window.setTimeout(() => {
    state.active = false;
    if (window.fetch === patchedFetch) window.fetch = originalFetch;
  }, state.protectionWindowMs);
})();

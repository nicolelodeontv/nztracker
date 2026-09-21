export const LIVE_REFRESH_INTERVAL_MS = 5000;
export const DASHBOARD_REFRESH_INTERVAL_MS = LIVE_REFRESH_INTERVAL_MS;
export const HEAVY_DASHBOARD_REFRESH_INTERVAL_MS = 60000;

export function createRefreshGate({
  now = () => Date.now(),
  minIntervalMs = DASHBOARD_REFRESH_INTERVAL_MS,
} = {}) {
  let lastRefreshAt = 0;
  let inFlight = null;

  return {
    run(task, { initial = false, force = false } = {}) {
      if (inFlight) return inFlight;

      const nowMs = now();
      if (!initial && !force && lastRefreshAt && nowMs - lastRefreshAt < minIntervalMs) {
        return Promise.resolve(null);
      }

      lastRefreshAt = nowMs;
      const taskPromise = Promise.resolve().then(task);
      inFlight = taskPromise.finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    getLastRefreshAt() {
      return lastRefreshAt;
    },
  };
}

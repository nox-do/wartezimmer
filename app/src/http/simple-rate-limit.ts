type RateWindow = {
  count: number;
  resetAt: number;
};

export function createRateLimiter(options: { maxRequests: number; windowMs: number }) {
  const buckets = new Map<string, RateWindow>();

  return function allow(key: string, now = Date.now()): boolean {
    let window = buckets.get(key);
    if (!window || now >= window.resetAt) {
      window = { count: 0, resetAt: now + options.windowMs };
      buckets.set(key, window);
    }
    window.count += 1;
    return window.count <= options.maxRequests;
  };
}

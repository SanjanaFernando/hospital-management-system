type CacheEntry = {
  value: unknown;
  timestamp: number;
};

const clientCache = new Map<string, CacheEntry>();

export const CLIENT_CACHE_TTL = {
  wards: 30_000,
  ward: 20_000,
} as const;

export function getClientCache<T>(key: string, maxAgeMs: number): T | null {
  const entry = clientCache.get(key);
  if (!entry) {
    return null;
  }

  if (Date.now() - entry.timestamp > maxAgeMs) {
    clientCache.delete(key);
    return null;
  }

  return entry.value as T;
}

export function setClientCache<T>(key: string, value: T): void {
  clientCache.set(key, {
    value,
    timestamp: Date.now(),
  });
}

export function clearClientCache(prefix?: string): void {
  if (!prefix) {
    clientCache.clear();
    return;
  }

  for (const key of clientCache.keys()) {
    if (key.startsWith(prefix)) {
      clientCache.delete(key);
    }
  }
}

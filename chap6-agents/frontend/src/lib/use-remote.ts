"use client";

import { useEffect, useState } from "react";

export interface Remote<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  retry: () => void;
}

export function useRemote<T>(key: string | null, load: (key: string) => Promise<T>): Remote<T> {
  const [cache, setCache] = useState<ReadonlyMap<string, T>>(new Map());
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const cached = key === null ? undefined : cache.get(key);

  useEffect(() => {
    if (key === null || cached !== undefined) return;
    let live = true;
    load(key).then(
      (data) => {
        if (live) setCache((current) => new Map(current).set(key, data));
      },
      (error: unknown) => {
        if (live) setFailure({ key, message: error instanceof Error ? error.message : "Lỗi không xác định" });
      },
    );
    return () => {
      live = false;
    };
  }, [key, cached, load, attempt]);

  const error = failure !== null && failure.key === key ? failure.message : null;
  const retry = () => {
    setFailure(null);
    setAttempt((count) => count + 1);
  };
  return { data: cached, error, loading: key !== null && cached === undefined && error === null, retry };
}

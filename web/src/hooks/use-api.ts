"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";

interface State<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
}

const shared = new Map<string, Promise<unknown>>();

function dedupe<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const hit = shared.get(id);
  if (hit) return hit as Promise<T>;
  const p = fn();
  shared.set(id, p);
  const drop = () => setTimeout(() => shared.get(id) === p && shared.delete(id), 1500);
  p.then(drop, drop);
  return p;
}

export function useApi<T>(fn: () => Promise<T>, key: string | number = "", share?: string) {
  const { version, me } = useSession();
  const [state, setState] = useState<State<T>>({ data: undefined, error: undefined, loading: true });
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!me) return;
    let alive = true;
    const run = () => fnRef.current();
    const p = share ? dedupe(`${me.id}:${version}:${share}:${key}`, run) : run();
    p.then((data) => alive && setState({ data, error: undefined, loading: false })).catch((error) => alive && setState({ data: undefined, error, loading: false }));
    return () => {
      alive = false;
    };
  }, [version, key, me, share]);

  return state;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/lib/session";

interface State<T> {
  data: T | undefined;
  error: unknown;
  loading: boolean;
}

export function useApi<T>(fn: () => Promise<T>, key: string | number = "") {
  const { version, me } = useSession();
  const [state, setState] = useState<State<T>>({ data: undefined, error: undefined, loading: true });
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    if (!me) return;
    let alive = true;
    fnRef
      .current()
      .then((data) => alive && setState({ data, error: undefined, loading: false }))
      .catch((error) => alive && setState({ data: undefined, error, loading: false }));
    return () => {
      alive = false;
    };
  }, [version, key, me]);

  return state;
}

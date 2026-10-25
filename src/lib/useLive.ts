import { useEffect, useState } from "react";
import type { DocumentReference, Query } from "firebase/firestore";
import { watchDoc, watchQuery, type Mapper } from "../firebase/data";

interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

/**
 * Subscribes to a query and re-renders whenever its results change, so every screen shows
 * changes made by anyone else as they happen. Pass a stable `key` that changes when the
 * query should change; `null` for the query means "don't subscribe yet".
 */
export function useLiveQuery<T>(query: Query | null, map: Mapper<T>, key: string): Live<T[]> {
  const [state, setState] = useState<Live<T[]>>({ data: [], loading: query !== null, error: null });
  useEffect(() => {
    if (!query) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return watchQuery(
      query,
      map,
      (data) => setState({ data, loading: false, error: null }),
      (error) => setState({ data: [], loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

export function useLiveDoc<T>(ref: DocumentReference | null, map: Mapper<T>, key: string): Live<T | null> {
  const [state, setState] = useState<Live<T | null>>({ data: null, loading: ref !== null, error: null });
  useEffect(() => {
    if (!ref) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return watchDoc(
      ref,
      map,
      (data) => setState({ data, loading: false, error: null }),
      (error) => setState({ data: null, loading: false, error }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state;
}

/** The current time, refreshed every `ms`, for running clocks. */
export function useNow(ms = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

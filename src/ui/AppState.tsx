"use client";

// App-wide state: the engine's method (model, noise floor), the selected profile and run, and the one running job.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, setSetting, requestPersistence } from "@/client/db";
import { getMethod, type Method } from "@/client/api";
import type { Progress } from "@/client/runner";
import type { Page, Profile, Run } from "@/client/types";

type Job = { progress: Progress; controller: AbortController; error?: string };

type State = {
  method: Method | null;
  methodError: string | null;
  profiles: Profile[] | undefined;
  profile: Profile | undefined;
  pages: Page[] | undefined;
  runs: Run[] | undefined;
  run: Run | undefined;
  selectProfile: (id: string | null) => void;
  selectRun: (id: string | null) => void;
  concurrency: number;
  setConcurrency: (n: number) => void;
  runsPerPage: number;
  setRunsPerPage: (n: number) => void;
  job: Job | null;
  startJob: (fn: (onProgress: (p: Progress) => void, signal: AbortSignal) => Promise<unknown>) => Promise<void>;
  clearJobError: () => void;
  notice: string | null; // short confirmation after a run finishes and its results are saved
  clearNotice: () => void;
};

const Ctx = createContext<State | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [method, setMethod] = useState<Method | null>(null);
  const [methodError, setMethodError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [concurrency, setConcurrencyState] = useState(2);
  const [runsPerPage, setRunsPerPageState] = useState(1);
  const [job, setJob] = useState<Job | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    getMethod().then(setMethod).catch((e) => setMethodError(e.message));
    requestPersistence();
    (async () => {
      setProfileId(await getSetting<string | null>("profileId", null));
      setRunId(await getSetting<string | null>("runId", null));
      setConcurrencyState(await getSetting<number>("pagesAtOnce", 2));
      setRunsPerPageState(await getSetting<number>("runsPerPage", 1));
    })();
  }, []);

  const profiles = useLiveQuery(() => db.profiles.orderBy("updatedAt").reverse().toArray(), []);
  const profile = useMemo(() => profiles?.find((p) => p.id === profileId) ?? profiles?.[0], [profiles, profileId]);
  const pages = useLiveQuery(async () => (profile ? (await db.pages.where({ profileId: profile.id }).toArray()).sort((a, b) => a.path.localeCompare(b.path)) : []), [profile?.id]);
  const runs = useLiveQuery(async () => (profile ? await db.runs.where({ profileId: profile.id }).reverse().sortBy("createdAt") : []), [profile?.id]);
  const run = useMemo(() => runs?.find((r) => r.id === runId && r.status === "complete") ?? runs?.find((r) => r.status === "complete"), [runs, runId]);

  const selectProfile = useCallback((id: string | null) => { setProfileId(id); setSetting("profileId", id); setRunId(null); setSetting("runId", null); }, []);
  const selectRun = useCallback((id: string | null) => { setRunId(id); setSetting("runId", id); }, []);
  const setConcurrency = useCallback((n: number) => { setConcurrencyState(n); setSetting("pagesAtOnce", n); }, []);
  const setRunsPerPage = useCallback((n: number) => { setRunsPerPageState(n); setSetting("runsPerPage", n); }, []);

  const startJob = useCallback<State["startJob"]>(async (fn) => {
    const controller = new AbortController();
    setJob({ progress: { phase: "Starting", done: 0, total: 1 }, controller });
    try {
      await fn((progress) => setJob((j) => (j ? { ...j, progress } : j)), controller.signal);
      setJob(null);
      setNotice("Run saved in this browser");
    } catch (e: any) {
      const stopped = e?.name === "AbortError";
      setJob((j) => (j ? { ...j, error: stopped ? "Stopped. Pages scored before the stop are kept in a failed run." : e?.message ?? String(e) } : j));
    }
  }, []);

  const value: State = {
    method, methodError, profiles, profile, pages, runs, run, selectProfile, selectRun,
    concurrency, setConcurrency, runsPerPage, setRunsPerPage,
    job, startJob, clearJobError: () => setJob(null),
    notice, clearNotice: () => setNotice(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppStateProvider");
  return v;
}

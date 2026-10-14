"use client";

// App-wide state: server config, the selected profile and run, and the one running job.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, getSetting, setSetting, requestPersistence } from "@/lib/db";
import { getConfig, type ServerConfig } from "@/lib/api";
import { currentFingerprint, type Progress } from "@/lib/engine";
import type { Calibration, Page, Profile, Run } from "@/lib/types";

type Job = { kind: "calibration" | "analysis"; progress: Progress; controller: AbortController; error?: string };

type State = {
  config: ServerConfig | null;
  configError: string | null;
  profiles: Profile[] | undefined;
  profile: Profile | undefined;
  pages: Page[] | undefined;
  calibration: Calibration | undefined; // latest calibration of the selected profile
  stale: boolean;
  runs: Run[] | undefined;
  run: Run | undefined;
  selectProfile: (id: string | null) => void;
  selectRun: (id: string | null) => void;
  concurrency: number;
  setConcurrency: (n: number) => void;
  job: Job | null;
  startJob: (kind: Job["kind"], fn: (onProgress: (p: Progress) => void, signal: AbortSignal) => Promise<unknown>) => Promise<void>;
  clearJobError: () => void;
  notice: string | null; // short confirmation after a job finishes and its results are saved
  clearNotice: () => void;
};

const Ctx = createContext<State | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [concurrencyOverride, setConcurrencyOverride] = useState<number | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [stale, setStale] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    getConfig().then((c) => { setConfig(c); setConfigError(c.error); }).catch((e) => setConfigError(e.message));
    requestPersistence();
    (async () => {
      setProfileId(await getSetting<string | null>("profileId", null));
      setRunId(await getSetting<string | null>("runId", null));
      setConcurrencyOverride(await getSetting<number | null>("concurrency", null));
      loaded.current = true;
    })();
  }, []);

  const profiles = useLiveQuery(() => db.profiles.orderBy("updatedAt").reverse().toArray(), []);
  const profile = useMemo(() => profiles?.find((p) => p.id === profileId) ?? profiles?.[0], [profiles, profileId]);
  const pages = useLiveQuery(async () => (profile ? (await db.pages.where({ profileId: profile.id }).toArray()).sort((a, b) => a.path.localeCompare(b.path)) : []), [profile?.id]);
  const calibration = useLiveQuery(async () => (profile ? (await db.calibrations.where({ profileId: profile.id }).sortBy("createdAt")).at(-1) : undefined), [profile?.id]);
  const runs = useLiveQuery(async () => (profile ? (await db.runs.where({ profileId: profile.id }).reverse().sortBy("createdAt")) : []), [profile?.id]);
  const run = useMemo(() => runs?.find((r) => r.id === runId && r.status === "complete") ?? runs?.find((r) => r.status === "complete"), [runs, runId]);

  useEffect(() => {
    let live = true;
    (async () => {
      if (!profile || !pages || !calibration || !config) return setStale(false);
      const fp = await currentFingerprint(profile, pages, config.model, config.questionVersion);
      if (live) setStale(fp !== calibration.fingerprint);
    })();
    return () => { live = false; };
  }, [profile, pages, calibration, config]);

  const selectProfile = useCallback((id: string | null) => { setProfileId(id); setSetting("profileId", id); setRunId(null); setSetting("runId", null); }, []);
  const selectRun = useCallback((id: string | null) => { setRunId(id); setSetting("runId", id); }, []);
  const setConcurrency = useCallback((n: number) => { setConcurrencyOverride(n); setSetting("concurrency", n); }, []);

  const startJob = useCallback<State["startJob"]>(async (kind, fn) => {
    const controller = new AbortController();
    setJob({ kind, progress: { phase: "Starting", done: 0, total: 1 }, controller });
    try {
      await fn((progress) => setJob((j) => (j ? { ...j, progress } : j)), controller.signal);
      setJob(null);
      setNotice(kind === "calibration" ? "Calibration saved in this browser" : "Run saved in this browser");
    } catch (e: any) {
      const paused = e?.name === "AbortError";
      setJob((j) => (j ? { ...j, error: paused ? undefined : e?.message ?? String(e) } : j));
      if (paused) setJob(null);
    }
  }, []);

  const value: State = {
    config, configError, profiles, profile, pages, calibration, stale, runs, run,
    selectProfile, selectRun,
    concurrency: concurrencyOverride ?? config?.concurrency ?? 4,
    setConcurrency, job, startJob, clearJobError: () => setJob(null),
    notice, clearNotice: () => setNotice(null),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useApp outside AppStateProvider");
  return v;
}

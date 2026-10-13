"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Divider from "@mui/material/Divider";
import Close from "@mui/icons-material/Close";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import { db } from "@/lib/db";
import { runAnalysis, resumeCalibration, startCalibration } from "@/lib/engine";
import { exportProfile, downloadJson } from "@/lib/io";
import { pointsAvailable, scoreLevel, level, band } from "@/lib/score";
import type { Result, Run, Scope } from "@/lib/types";
import { useApp } from "./AppState";
import { BandChart, TermChart } from "./charts";

const fmt = (n: number | undefined, d = 2) => (n === undefined || Number.isNaN(n) ? "–" : n.toFixed(d));
const when = (t?: number) => (t ? new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");

function LevelChip({ score }: { score: number }) {
  const l = scoreLevel(score);
  const color = l === "weak" ? "error" : l === "fair" ? "secondary" : "primary";
  return <Chip size="small" variant="outlined" color={color as any} label={l[0].toUpperCase() + l.slice(1)} />;
}

function ScoreCard({ label, value, sd, note, children }: { label: string; value: string; sd?: number; note?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card sx={{ flex: 1, minWidth: 220 }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ my: 1 }}>
          <Typography variant="h1" component="p" sx={{ fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
          {sd !== undefined && <Typography variant="body2" color="text.secondary">± {fmt(band(sd))}</Typography>}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">{children}<Typography variant="body2" color="text.secondary">{note}</Typography></Stack>
      </CardContent>
    </Card>
  );
}

export function DashboardView({ onEdit }: { onEdit: () => void }) {
  const app = useApp();
  const { profile, pages, calibration, stale, runs, run, config, job, startJob, concurrency } = app;
  const [detail, setDetail] = useState<string | null>(null);

  const results = useLiveQuery(async () => (run ? db.results.where({ runId: run.id }).toArray() : []), [run?.id]);
  const previous: Run | undefined = useMemo(() => {
    if (!run || !runs) return undefined;
    return runs.filter((r) => r.status === "complete" && r.calibrationId === run.calibrationId && r.createdAt < run.createdAt).sort((a, b) => b.createdAt - a.createdAt)[0];
  }, [run, runs]);
  const prevResults = useLiveQuery(async () => (previous ? db.results.where({ runId: previous.id }).toArray() : []), [previous?.id]);
  const runCal = useLiveQuery(async () => (run ? db.calibrations.get(run.calibrationId) : undefined), [run?.calibrationId]);

  if (!profile || !pages) return null;
  const terms = profile.terms;
  const byKey = (rs: Result[] | undefined) => new Map((rs ?? []).map((r) => [`${r.pageId}|${r.scope}`, r]));
  const now = byKey(results), before = byKey(prevResults);
  const sdOf = (pageId: string, scope: Scope) => runCal?.pageStats?.[pageId]?.[scope]?.sd ?? 0;
  const runPages = pages.filter((p) => (runCal?.pageIds ?? calibration?.pageIds ?? []).includes(p.id));
  const calOk = calibration?.status === "complete" && !stale;
  const busy = !!job && !job.error;

  const rows = runPages.map((p) => {
    const m = now.get(`${p.id}|meta`), g = now.get(`${p.id}|page`), pm = before.get(`${p.id}|meta`);
    let change = "first run";
    if (m && pm) change = level(m.score, sdOf(p.id, "meta"), pm.score, sdOf(p.id, "meta")) ? "level" : `${m.score > pm.score ? "+" : "−"}${fmt(Math.abs(m.score - pm.score))}`;
    else if (m && previous === undefined && runs?.some((r) => r.status === "complete" && r.id !== run?.id)) change = "not comparable";
    return { id: p.id, path: p.path, intent: p.intent, meta: m?.score, metaSd: sdOf(p.id, "meta"), page: g?.score, pageSd: sdOf(p.id, "page"), change };
  });

  const metaSd = runCal?.siteSd?.meta, pageSd = runCal?.siteSd?.page;
  const pointsAvail = rows.reduce((s, r) => s + (r.meta !== undefined ? 10 - r.meta : 0), 0);

  const columns: GridColDef<(typeof rows)[number]>[] = [
    { field: "path", headerName: "Page", flex: 1, minWidth: 180 },
    { field: "intent", headerName: "Intent statement", flex: 1.4, minWidth: 220 },
    { field: "meta", headerName: "Metadata score", width: 150, type: "number", valueFormatter: (v: number | undefined) => fmt(v),
      renderCell: (p) => (p.value === undefined ? "–" : `${fmt(p.value)} ± ${fmt(band(p.row.metaSd))}`) },
    { field: "page", headerName: "Page score", width: 140, type: "number",
      renderCell: (p) => (p.value === undefined ? "–" : `${fmt(p.value)} ± ${fmt(band(p.row.pageSd))}`) },
    { field: "change", headerName: "Change", width: 130 },
    { field: "level", headerName: "Level", width: 100, sortable: false, renderCell: (p) => (p.row.meta === undefined ? null : <LevelChip score={p.row.meta} />) },
  ];

  const calibrate = () => startJob("calibration", (onP, signal) => startCalibration(profile, pages, { model: config!.model, questionVersion: config!.questionVersion, concurrency }, onP, signal));
  const resume = () => startJob("calibration", (onP, signal) => resumeCalibration(calibration!.id, concurrency, onP, signal));
  const analyse = () => startJob("analysis", async (onP, signal) => {
    const n = (runs?.filter((r) => r.calibrationId === calibration!.id).length ?? 0) + 1;
    const id = await runAnalysis(profile, pages, calibration!, { concurrency }, n === 1 ? "Baseline" : `Run ${n}`, onP, signal);
    app.selectRun(id);
  });
  const doExport = async () => downloadJson(await exportProfile(profile.id), `${profile.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.seo-jev-analyzer.json`);

  const detailPage = pages.find((p) => p.id === detail);
  const dm = detail ? now.get(`${detail}|meta`) : undefined, dg = detail ? now.get(`${detail}|page`) : undefined;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={2}>
        <Box>
          <Typography variant="h4" component="h1">{profile.name}</Typography>
          <Typography variant="body2" color="text.secondary">{profile.domain} · {pages.filter((p) => p.included).length} pages · {terms.length} terms</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button onClick={onEdit} disabled={busy}>Edit profile</Button>
          <Button onClick={doExport}>Export</Button>
          {(!calibration || stale || calibration.status === "failed") && <Button variant="contained" onClick={calibrate} disabled={busy || !config || !!config.error}>Calibrate</Button>}
          {calibration?.status === "running" && !busy && <Button variant="contained" onClick={resume}>Resume calibration</Button>}
          {calOk && <Button variant="contained" onClick={analyse} disabled={busy}>Run now</Button>}
        </Stack>
      </Stack>

      {app.configError && <Alert severity="error">Server configuration: {app.configError}</Alert>}
      {config?.mock && <Alert severity="warning">Test mode: Jev answers are simulated.</Alert>}
      {job && (
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="body2">{job.error ? "Stopped" : job.progress.phase}: {job.progress.done.toLocaleString()} of {job.progress.total.toLocaleString()}</Typography>
              {job.error ? <Button size="small" onClick={app.clearJobError}>Dismiss</Button> : <Button size="small" onClick={() => job.controller.abort()}>Pause</Button>}
            </Stack>
            <LinearProgress variant="determinate" value={(100 * job.progress.done) / Math.max(1, job.progress.total)} />
            {job.error && <Alert severity="error" sx={{ mt: 2 }}>{job.error}</Alert>}
          </CardContent>
        </Card>
      )}
      {!calibration && !job && <Alert severity="info">Calibrate this profile before the first run. Calibration measures how much Jev's scores vary, so every score can carry its band.</Alert>}
      {calibration?.status === "running" && !job && <Alert severity="warning">Calibration paused. Resume to finish it.</Alert>}
      {calibration?.status === "failed" && <Alert severity="error">Calibration failed: {calibration.error}</Alert>}
      {stale && calibration && <Alert severity="error">The profile changed since it was calibrated (terms, intents, expected lists, pages, question wording or Jev version). Recalibrate before new runs.</Alert>}
      {calibration?.status === "complete" && (
        <Alert severity={profile.lastExportedAt && profile.lastExportedAt > (calibration.completedAt ?? 0) ? "info" : "warning"} icon={false}>
          Calibrated {when(calibration.completedAt)} with {calibration.model} · {calibration.runsTarget} runs · site band ± {fmt(band(calibration.siteSd?.meta ?? 0))} · last exported {when(profile.lastExportedAt)}
          {calibration.error ? ` · ${calibration.error}` : ""}
        </Alert>
      )}

      {run && results && (
        <>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <ScoreCard label="Metadata score, profile" value={fmt(run.profileScore?.meta, 1)} sd={metaSd} note={previous ? `${run.label} vs ${previous.label}` : run.label}>
              {run.profileScore && <LevelChip score={run.profileScore.meta} />}
            </ScoreCard>
            <ScoreCard label="Page score, profile" value={fmt(run.profileScore?.page, 1)} sd={pageSd} note="metadata plus body">
              {run.profileScore && <LevelChip score={run.profileScore.page} />}
            </ScoreCard>
            <ScoreCard label="Points available" value={fmt(pointsAvail, 1)} note={`metadata, across ${rows.length} pages`} />
          </Stack>
          {runCal && run.calibrationId !== calibration?.id && <Alert severity="info">This run was scored under an earlier calibration.</Alert>}
          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" sx={{ mb: 1 }}>Score by page, with ± 2 SD band</Typography>
              <BandChart
                rows={rows.map((r) => ({ id: r.id, label: r.path, meta: r.meta === undefined ? undefined : { score: r.meta, sd: r.metaSd }, page: r.page === undefined ? undefined : { score: r.page, sd: r.pageSd } }))}
                onSelect={setDetail}
              />
            </CardContent>
          </Card>
          <Card>
            <DataGrid
              rows={rows}
              columns={columns}
              autoHeight
              density="compact"
              disableRowSelectionOnClick
              onRowClick={(p) => setDetail(String(p.id))}
              initialState={{ sorting: { sortModel: [{ field: "meta", sort: "asc" }] } }}
              pageSizeOptions={[25, 50, 100]}
              sx={{ border: 0, "& .MuiDataGrid-row": { cursor: "pointer" } }}
            />
          </Card>
        </>
      )}
      {calOk && !run && !job && <Alert severity="success">Calibration complete. Select Run now for the first scored run.</Alert>}

      <Drawer anchor="right" open={!!detailPage} onClose={() => setDetail(null)} PaperProps={{ sx: { width: { xs: "100%", sm: 480 }, borderTopLeftRadius: 16, borderBottomLeftRadius: 16 } }}>
        {detailPage && (
          <Box sx={{ p: 3 }}>
            <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
              <Box>
                <Typography variant="h6" component="h2">{detailPage.path}</Typography>
                <Typography variant="body2" color="text.secondary">{detailPage.intent}</Typography>
              </Box>
              <IconButton aria-label="Close" onClick={() => setDetail(null)}><Close /></IconButton>
            </Stack>
            {dm ? (
              <Stack spacing={2.5} sx={{ mt: 2 }}>
                <Stack direction="row" spacing={3}>
                  <Box><Typography variant="caption" color="text.secondary">Metadata score</Typography><Typography variant="h4">{fmt(dm.score)}</Typography><Typography variant="caption" color="text.secondary">{fmt(dm.termSum)} × {fmt(dm.intentFit, 3)}</Typography></Box>
                  {dg && <Box><Typography variant="caption" color="text.secondary">Page score</Typography><Typography variant="h4">{fmt(dg.score)}</Typography><Typography variant="caption" color="text.secondary">{fmt(dg.termSum)} × {fmt(dg.intentFit, 3)}</Typography></Box>}
                </Stack>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Metadata as read</Typography>
                  <Typography variant="body2"><b>Title:</b> {dm.text.meta.title || "–"}</Typography>
                  <Typography variant="body2"><b>Description:</b> {dm.text.meta.description || "–"}</Typography>
                  <Typography variant="body2"><b>Open Graph:</b> {dm.text.meta.ogTitle || "–"}{dm.text.meta.ogDescription ? ` · ${dm.text.meta.ogDescription}` : ""}</Typography>
                  <Typography variant="body2"><b>JSON-LD:</b> {dm.text.meta.jsonLd.length ? dm.text.meta.jsonLd.slice(0, 8).join(" · ") : "–"}</Typography>
                </Box>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Expected terms, metadata ratings</Typography>
                  <TermChart items={detailPage.expected.map((t) => ({ term: t, rating: dm.terms[terms.indexOf(t)] ?? 0 }))} />
                </Box>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Points available, largest first</Typography>
                  <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                    {pointsAvailable(terms, dm.terms, detailPage.expected, dm.intentFit).slice(0, 8).map((it) => (
                      <Typography component="li" variant="body2" key={it.label}>
                        {it.kind === "intent" ? "Intent discount" : `Term “${it.label}”`}: {fmt(it.points)} points
                      </Typography>
                    ))}
                  </Box>
                </Box>
              </Stack>
            ) : (
              <Typography variant="body2" sx={{ mt: 2 }} color="text.secondary">No result for this page in the selected run.</Typography>
            )}
          </Box>
        )}
      </Drawer>
    </Stack>
  );
}

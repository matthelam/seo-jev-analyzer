"use client";

import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import Stack from "@mui/material/Stack";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import Tooltip from "@mui/material/Tooltip";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import Divider from "@mui/material/Divider";
import Close from "@mui/icons-material/Close";
import { DataGrid, type GridColDef } from "@mui/x-data-grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Link from "@mui/material/Link";
import { db } from "@/client/db";
import { runProfile } from "@/client/runner";
import { exportProfile, downloadJson } from "@/client/io";
import { compareResults, changeThreshold } from "@/core/noise";
import { requestsPerRun } from "@/core/inputs";
import { pointsRemaining, profileBand as bandOf } from "@/core/summary";
import { scoreLevel } from "@/core/scoring";
import type { ScoreResult } from "@/core/schema";
import type { Run, StoredResult } from "@/client/types";
import { useApp } from "./AppState";
import { BandChart, TermChart } from "./charts";

const fmt = (n: number | undefined, d = 2) => (n === undefined || Number.isNaN(n) ? "–" : n.toFixed(d));
const when = (t?: number) => (t ? new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "never");

function LevelChip({ score }: { score: number }) {
  const l = scoreLevel(score);
  const color = l === "weak" ? "error" : l === "fair" ? "secondary" : "primary";
  return <Chip size="small" variant="outlined" color={color as any} label={l[0].toUpperCase() + l.slice(1)} />;
}

function ScoreCard({ label, value, band, note, children }: { label: string; value: string; band?: number; note?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <Card sx={{ flex: 1, minWidth: 220 }}>
      <CardContent>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        <Stack direction="row" alignItems="baseline" spacing={1} sx={{ my: 1 }}>
          <Typography variant="h1" component="p" sx={{ fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
          {band !== undefined && <Typography variant="body2" color="text.secondary">± {fmt(band)}</Typography>}
        </Stack>
        <Stack direction="row" spacing={1} alignItems="center">{children}<Typography variant="body2" color="text.secondary">{note}</Typography></Stack>
      </CardContent>
    </Card>
  );
}

const changeText = (cur: ScoreResult | undefined, prev: ScoreResult | undefined) => {
  if (!cur) return "–";
  if (!prev) return "first run";
  const c = compareResults(cur, prev);
  if (!c.comparable) return "not comparable";
  const m = c.scores.meta;
  if (!m) return "–";
  return m.verdict === "level" ? "level" : `${m.delta > 0 ? "+" : "−"}${fmt(Math.abs(m.delta))}`;
};

export function DashboardView({ onEdit }: { onEdit: () => void }) {
  const app = useApp();
  const { profile, pages, runs, run, method, job, startJob, concurrency, runsPerPage, setRunsPerPage } = app;
  const [detail, setDetail] = useState<string | null>(null);

  const results = useLiveQuery(async () => (run ? db.scores.where({ runId: run.id }).toArray() : []), [run?.id]);
  const previous: Run | undefined = useMemo(() => {
    if (!run || !runs) return undefined;
    return runs.filter((r) => r.status === "complete" && r.createdAt < run.createdAt).sort((a, b) => b.createdAt - a.createdAt)[0];
  }, [run, runs]);
  const prevResults = useLiveQuery(async () => (previous ? db.scores.where({ runId: previous.id }).toArray() : []), [previous?.id]);

  if (!profile || !pages) return null;
  const terms = profile.terms;
  const byPage = (rs: StoredResult[] | undefined) => new Map((rs ?? []).map((r) => [r.pageId, r.result]));
  const now = byPage(results), before = byPage(prevResults);
  const busy = !!job && !job.error;
  const runPages = run ? pages.filter((p) => run.pageIds.includes(p.id)) : [];

  const rows = runPages.map((p) => {
    const r = now.get(p.id);
    return { id: p.id, path: p.path, intent: p.intent, meta: r?.scores.meta?.score, page: r?.scores.page?.score, band: r?.noiseFloor, change: changeText(r, before.get(p.id)) };
  });
  const scored = [...now.values()];
  const profileBand = bandOf(scored);
  const pointsAvail = pointsRemaining(scored, "meta");

  const columns: GridColDef<(typeof rows)[number]>[] = [
    { field: "path", headerName: "Page", flex: 1, minWidth: 180 },
    { field: "intent", headerName: "Intent statement", flex: 1.4, minWidth: 220 },
    { field: "meta", headerName: "Metadata score", width: 150, type: "number", valueFormatter: (v: number | undefined) => fmt(v),
      renderCell: (p) => (p.value === undefined ? "–" : `${fmt(p.value)} ± ${fmt(p.row.band)}`) },
    { field: "page", headerName: "Page score", width: 140, type: "number",
      renderCell: (p) => (p.value === undefined ? "–" : `${fmt(p.value)} ± ${fmt(p.row.band)}`) },
    { field: "change", headerName: "Change", width: 130 },
    { field: "level", headerName: "Level", width: 100, sortable: false, renderCell: (p) => (p.row.meta === undefined ? null : <LevelChip score={p.row.meta} />) },
  ];

  const analyse = () => startJob(async (onP, signal) => {
    const id = await runProfile(profile.id, { runsPerPage, concurrency }, onP, signal);
    app.selectRun(id);
  });
  const doExport = async () => downloadJson(await exportProfile(profile.id), `${profile.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.seo-jev-analyzer.json`);
  const included = pages.filter((p) => p.included).length;

  const detailPage = pages.find((p) => p.id === detail);
  const dr = detail ? now.get(detail) : undefined;
  const dm = dr?.scores.meta, dg = dr?.scores.page;

  return (
    <Stack spacing={3}>
      <Stack direction={{ xs: "column", md: "row" }} justifyContent="space-between" alignItems={{ md: "center" }} spacing={2}>
        <Box>
          <Typography variant="h4" component="h1">{profile.name}</Typography>
          <Typography variant="body2" color="text.secondary">{profile.domain} · {pages.filter((p) => p.included).length} pages · {terms.length} terms</Typography>
        </Box>
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button onClick={onEdit} disabled={busy}>Edit profile</Button>
          <Tooltip describeChild title="Work is saved in this browser automatically. Export a file to back up the profile, open it in another browser, or host it for the MCP profileUrl."><Button onClick={doExport}>Export file</Button></Tooltip>
          <TextField select size="small" label="Runs per page" value={runsPerPage} onChange={(e) => setRunsPerPage(Number(e.target.value))} sx={{ width: 140 }} disabled={busy}>
            {[1, 2, 3, 5, 10].map((n) => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField>
          <Button variant="contained" onClick={analyse} disabled={busy || !method || !included}>Run now</Button>
        </Stack>
      </Stack>

      {app.methodError && <Alert severity="error">Server: {app.methodError}</Alert>}
      {method?.simulated && <Alert severity="warning">Test mode: Jev answers are simulated.</Alert>}
      {job && (
        <Card>
          <CardContent>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 1 }}>
              <Typography variant="body2">{job.error ? "Stopped" : job.progress.phase}: {job.progress.done.toLocaleString()} of {job.progress.total.toLocaleString()}</Typography>
              {job.error ? <Button size="small" onClick={app.clearJobError}>Dismiss</Button> : <Button size="small" onClick={() => job.controller.abort()}>Stop</Button>}
            </Stack>
            <LinearProgress variant="determinate" value={(100 * job.progress.done) / Math.max(1, job.progress.total)} />
            {job.error && <Alert severity="error" sx={{ mt: 2 }}>{job.error}</Alert>}
          </CardContent>
        </Card>
      )}
      {method && (
        <Alert severity="info" icon={false}>
          {method.model} · questions {method.questionVersion} · each score ± {fmt(method.noiseFloor ?? undefined)} · a change within ± {fmt(method.noiseFloor === null ? undefined : changeThreshold(method.noiseFloor, runsPerPage, runsPerPage))} between runs of {runsPerPage} counts as level (<Link href="/guide/jev-consistency-report">evidence</Link>) · {included} pages · {requestsPerRun(included, runsPerPage)} Jev requests per run · saved in this browser
        </Alert>
      )}
      {!run && !job && <Alert severity="info">Select Run now to score every ticked page. The first run is the baseline; later runs show the change.</Alert>}

      {run && results && (
        <>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
            <ScoreCard label="Metadata score, profile" value={fmt(run.profileScore?.meta, 1)} band={profileBand} note={previous ? `${run.label} vs ${previous.label}` : run.label}>
              {run.profileScore?.meta !== undefined && <LevelChip score={run.profileScore.meta} />}
            </ScoreCard>
            <ScoreCard label="Page score, profile" value={fmt(run.profileScore?.page, 1)} band={profileBand} note="metadata plus body">
              {run.profileScore?.page !== undefined && <LevelChip score={run.profileScore.page} />}
            </ScoreCard>
            <ScoreCard label="Points available" value={fmt(pointsAvail, 1)} note={`metadata, across ${rows.length} pages`} />
          </Stack>
          {run.runsPerPage > 1 && <Typography variant="body2" color="text.secondary">Each score is the mean of {run.runsPerPage} runs.</Typography>}
          <Card>
            <CardContent>
              <Typography variant="h6" component="h2" sx={{ mb: 1 }}>Score by page, with the noise floor as a band</Typography>
              <BandChart
                rows={rows.map((r) => ({ id: r.id, label: r.path, meta: r.meta === undefined ? undefined : { score: r.meta, band: r.band ?? 0 }, page: r.page === undefined ? undefined : { score: r.page, band: r.band ?? 0 } }))}
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
                  <Box><Typography variant="caption" color="text.secondary">Metadata score</Typography><Typography variant="h4">{fmt(dm.score)}</Typography><Typography variant="caption" color="text.secondary">{fmt(dm.termSum)} × {fmt(dm.intentFit, 3)}{dm.sd !== null ? ` · SD ${fmt(dm.sd, 3)}` : ""}</Typography></Box>
                  {dg && <Box><Typography variant="caption" color="text.secondary">Page score</Typography><Typography variant="h4">{fmt(dg.score)}</Typography><Typography variant="caption" color="text.secondary">{fmt(dg.termSum)} × {fmt(dg.intentFit, 3)}{dg.sd !== null ? ` · SD ${fmt(dg.sd, 3)}` : ""}</Typography></Box>}
                </Stack>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Metadata as read</Typography>
                  <Typography variant="body2"><b>Title:</b> {dr!.text.meta.title || "–"}</Typography>
                  <Typography variant="body2"><b>Description:</b> {dr!.text.meta.description || "–"}</Typography>
                  <Typography variant="body2"><b>Open Graph:</b> {dr!.text.meta.ogTitle || "–"}{dr!.text.meta.ogDescription ? ` · ${dr!.text.meta.ogDescription}` : ""}</Typography>
                  <Typography variant="body2"><b>JSON-LD:</b> {dr!.text.meta.jsonLd.length ? dr!.text.meta.jsonLd.slice(0, 8).join(" · ") : "–"}</Typography>
                </Box>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Expected terms, metadata ratings</Typography>
                  <TermChart items={detailPage.expected.map((t) => ({ term: t, rating: dm.ratings[t] ?? 0 }))} />
                </Box>
                <Divider />
                <Box>
                  <Typography variant="subtitle2" sx={{ mb: 1 }}>Points available, largest first</Typography>
                  <Box component="ol" sx={{ m: 0, pl: 2.5 }}>
                    {dm.pointsAvailable.slice(0, 8).map((it) => (
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

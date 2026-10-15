"use client";

// Tests revised content against the live page before it is published. Loads the text the scorer reads,
// lets the user edit it, and sends only the changed fields to test_revision. After the first try the
// current page's result is kept as the baseline, so each further try scores the revision only.

import { useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import LinearProgress from "@mui/material/LinearProgress";
import Box from "@mui/material/Box";
import * as api from "@/client/api";
import { SCOPES, type PageMeta, type Revision, type RevisionResult, type ScoreResult } from "@/core/schema";
import type { Page, Profile } from "@/client/types";

type Fields = { title: string; description: string; ogTitle: string; ogDescription: string; body: string };
const EMPTY: Fields = { title: "", description: "", ogTitle: "", ogDescription: "", body: "" };
const FIELDS: { key: keyof Fields; label: string; rows?: number }[] = [
  { key: "title", label: "Title" },
  { key: "description", label: "Meta description", rows: 2 },
  { key: "ogTitle", label: "Open Graph title" },
  { key: "ogDescription", label: "Open Graph description", rows: 2 },
  { key: "body", label: "Main body text, one paragraph or heading per line", rows: 10 },
];
const fromText = (meta: PageMeta, body: string): Fields => ({ title: meta.title, description: meta.description, ogTitle: meta.ogTitle, ogDescription: meta.ogDescription, body });
const fmt = (n: number) => n.toFixed(2);
const scopeLabel = { meta: "Metadata score", page: "Page score" } as const;

function VerdictChip({ verdict }: { verdict: "up" | "down" | "level" }) {
  const color = verdict === "up" ? "primary" : verdict === "down" ? "error" : "default";
  return <Chip size="small" variant="outlined" color={color} label={verdict === "level" ? "Level" : verdict === "up" ? "Better" : "Worse"} />;
}

export function RevisionDialog({ open, onClose, page, profile, baseline, runs }: {
  open: boolean;
  onClose: () => void;
  page: Page;
  profile: Profile;
  /** The page's result from the selected run; used as the current score while the live text still matches it. */
  baseline?: ScoreResult;
  runs: number;
}) {
  const [live, setLive] = useState<Fields | null>(null);
  const [draft, setDraft] = useState<Fields>(EMPTY);
  const [current, setCurrent] = useState<ScoreResult | undefined>(baseline);
  const [tries, setTries] = useState<RevisionResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setLive(null); setTries([]); setError(null); setCurrent(baseline);
    const ctl = new AbortController();
    api.readPage({ page: page.url, boilerplate: profile.boilerplate }, ctl.signal)
      .then((r) => { const f = fromText(r.meta, r.body); setLive(f); setDraft(f); })
      .catch((e) => { if (e?.name !== "AbortError") setError(`Could not read the live page: ${e.message}`); });
    return () => ctl.abort();
    // Reload only when the dialog opens or the page changes; later profile or run updates must not wipe the tries.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page.url]);

  const revision: Revision = {};
  if (live) for (const { key } of FIELDS) if (draft[key] !== live[key]) revision[key] = draft[key];
  const changes = Object.keys(revision).length;

  const test = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.testRevision({
        page: page.url, intent: page.intent, expected: page.expected, terms: profile.terms, boilerplate: profile.boilerplate,
        // Without a baseline, score both scopes once so the kept current result serves every later try.
        runs, revision, baseline: current, scopes: current ? undefined : ["meta", "page"],
      });
      if (r.currentFrom === "scored") setCurrent(r.current);
      setTries((t) => [r, ...t]);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="md">
      <DialogTitle>Test a revision: {page.path}</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Typography variant="body2" color="text.secondary">
            Edit the live text below and test it before publishing. Only changed fields are sent; JSON-LD stays as published.
            {current ? " The current page's score is reused while its text is unchanged, so each try scores the revision only." : ""}
          </Typography>
          {!live && !error && <LinearProgress />}
          {error && <Alert severity="error">{error}</Alert>}
          {live && FIELDS.map((f) => (
            <TextField
              key={f.key}
              label={f.label}
              value={draft[f.key]}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
              multiline={!!f.rows}
              minRows={f.rows}
              maxRows={f.key === "body" ? 20 : undefined}
              helperText={draft[f.key] !== live[f.key] ? "Changed" : undefined}
              disabled={busy}
            />
          ))}
          {busy && <LinearProgress />}
          {tries.map((t, i) => (
            <Box key={t.revised.scoredAt} sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
              <Typography variant="subtitle2">Try {tries.length - i}: changed {t.changed.join(", ")}</Typography>
              {SCOPES.map((s) => {
                const c = t.comparison.scores[s];
                return c ? (
                  <Stack key={s} direction="row" spacing={1.5} alignItems="center" sx={{ mt: 1 }}>
                    <Typography variant="body2" sx={{ minWidth: 130 }}>{scopeLabel[s]}</Typography>
                    <Typography variant="body2" sx={{ fontVariantNumeric: "tabular-nums" }}>{fmt(c.before)} → {fmt(c.after)} ({c.delta >= 0 ? "+" : "−"}{fmt(Math.abs(c.delta))})</Typography>
                    <VerdictChip verdict={c.verdict} />
                  </Stack>
                ) : null;
              })}
              <Typography variant="caption" color="text.secondary">A change within ± {fmt(t.comparison.threshold)} is level.</Typography>
              {t.warnings.map((w) => <Alert key={w} severity="warning" sx={{ mt: 1 }}>{w}</Alert>)}
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => live && setDraft(live)} disabled={busy || !changes}>Reset to live</Button>
        <Button onClick={onClose} disabled={busy}>Close</Button>
        <Button variant="contained" onClick={test} disabled={busy || !live || !changes}>Test revision</Button>
      </DialogActions>
    </Dialog>
  );
}

"use client";

// Profile setup: 1 domain and sitemap, 2 pages, 3 terms and intents, 4 save and calibrate.
// Also used to edit an existing profile. Import and the example profile skip straight to review.

import { useMemo, useRef, useState } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stepper from "@mui/material/Stepper";
import Step from "@mui/material/Step";
import StepLabel from "@mui/material/StepLabel";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import LinearProgress from "@mui/material/LinearProgress";
import { db, newId } from "@/lib/db";
import { findSitemap } from "@/lib/api";
import { importProfile } from "@/lib/io";
import { matchesFilter } from "@/lib/filter";
import type { Page, Profile } from "@/lib/types";
import { useApp } from "./AppState";

type Draft = { url: string; path: string; included: boolean; intent: string; expected: string[]; id?: string };

const STEPS = ["Domain and sitemap", "Pages", "Terms and intents", "Save and calibrate"];

const pathOf = (url: string) => { try { return new URL(url).pathname || "/"; } catch { return url; } };

export function SetupStepper({ existing, onDone }: { existing?: { profile: Profile; pages: Page[] }; onDone: (profileId: string, calibrate: boolean) => void }) {
  const { selectProfile } = useApp();
  const [step, setStep] = useState(existing ? 1 : 0);
  const [name, setName] = useState(existing?.profile.name ?? "");
  const [domain, setDomain] = useState(existing?.profile.domain ?? "");
  const [sitemapUrl, setSitemapUrl] = useState(existing?.profile.sitemapUrl ?? "");
  const [filter, setFilter] = useState(existing?.profile.pathFilter ?? "");
  const [termsText, setTermsText] = useState(existing?.profile.terms.join("\n") ?? "");
  const [drafts, setDrafts] = useState<Draft[]>(
    existing?.pages.map((p) => ({ id: p.id, url: p.url, path: p.path, included: p.included, intent: p.intent, expected: p.expected })) ?? [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const terms = useMemo(() => [...new Set(termsText.split(/\r?\n/).map((t) => t.trim()).filter(Boolean))], [termsText]);
  const shown = drafts.filter((d) => matchesFilter(d.path, filter));
  const included = drafts.filter((d) => d.included);

  const problems = useMemo(() => {
    const out: string[] = [];
    if (!terms.length) out.push("Paste the search terms, one per line");
    for (const d of included) {
      if (!d.intent.trim()) out.push(`${d.path}: intent statement missing`);
      if (d.expected.length !== 10) out.push(`${d.path}: ${d.expected.length} of 10 expected terms`);
      const unknown = d.expected.filter((t) => !terms.includes(t));
      if (unknown.length) out.push(`${d.path}: not in the term list: ${unknown.join(", ")}`);
    }
    return out;
  }, [terms, included]);

  async function discover() {
    setBusy(true); setError("");
    try {
      const r = await findSitemap(domain, sitemapUrl || undefined);
      setDomain(r.origin); setSitemapUrl(r.sitemapUrl);
      if (!name.trim()) setName(new URL(r.origin).hostname);
      const old = new Map(drafts.map((d) => [d.url, d]));
      setDrafts(r.urls.map((u) => old.get(u) ?? { url: u, path: pathOf(u), included: false, intent: "", expected: [] }));
      setStep(1);
    } catch (e: any) {
      setError(e.message);
    } finally { setBusy(false); }
  }

  async function importFile(file: File) {
    setError("");
    try {
      const id = await importProfile(JSON.parse(await file.text()));
      selectProfile(id); onDone(id, false);
    } catch (e: any) { setError(e.message); }
  }

  async function loadExample() {
    setError("");
    try {
      const res = await fetch("/examples/boulderfest.json");
      const id = await importProfile(await res.json());
      selectProfile(id); onDone(id, false);
    } catch (e: any) { setError(e.message); }
  }

  async function save(calibrate: boolean) {
    setBusy(true); setError("");
    try {
      const now = Date.now();
      const id = existing?.profile.id ?? newId();
      const profile: Profile = {
        ...(existing?.profile ?? { createdAt: now }), id, name: name.trim() || domain, domain, sitemapUrl, pathFilter: filter, terms, updatedAt: now,
      } as Profile;
      await db.transaction("rw", [db.profiles, db.pages], async () => {
        await db.profiles.put(profile);
        await db.pages.where({ profileId: id }).delete();
        await db.pages.bulkPut(drafts.map((d) => ({ id: d.id ?? newId(), profileId: id, url: d.url, path: d.path, intent: d.intent.trim(), expected: d.expected, included: d.included })));
      });
      selectProfile(id);
      onDone(id, calibrate);
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  const update = (url: string, patch: Partial<Draft>) => setDrafts((ds) => ds.map((d) => (d.url === url ? { ...d, ...patch } : d)));

  return (
    <Card>
      <CardContent sx={{ p: { xs: 2, md: 4 } }}>
        <Typography variant="h5" component="h2" sx={{ mb: 3 }}>{existing ? `Edit profile: ${existing.profile.name}` : "Set up a profile"}</Typography>
        <Stepper activeStep={step} alternativeLabel sx={{ mb: 4 }}>
          {STEPS.map((s) => <Step key={s}><StepLabel>{s}</StepLabel></Step>)}
        </Stepper>
        {busy && <LinearProgress sx={{ mb: 2 }} />}
        {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>{error}</Alert>}

        {step === 0 && (
          <Stack spacing={2} sx={{ maxWidth: 560 }}>
            <TextField label="Site address" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} required />
            <TextField label="Sitemap address (optional)" helperText="Leave empty to find it from robots.txt or /sitemap.xml" value={sitemapUrl} onChange={(e) => setSitemapUrl(e.target.value)} />
            <TextField label="Profile name" value={name} onChange={(e) => setName(e.target.value)} />
            <Box><Button variant="contained" onClick={discover} disabled={!domain.trim() || busy}>Find pages</Button></Box>
            {!existing && (
              <>
                <Divider>or</Divider>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
                  <Button variant="outlined" onClick={() => fileRef.current?.click()}>Import a profile file</Button>
                  <Button variant="text" onClick={loadExample}>Load the Boulderfest example</Button>
                </Stack>
                <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
              </>
            )}
          </Stack>
        )}

        {step === 1 && (
          <Stack spacing={2}>
            <TextField
              label="Filter by path"
              placeholder={`${domain.replace(/^https?:\/\//, "")}/courses`}
              helperText="Every page whose path starts with what you type stays in the list"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              sx={{ maxWidth: 560 }}
            />
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2" color="text.secondary">{shown.length} shown · {included.length} ticked</Typography>
              <Button size="small" onClick={() => shown.forEach((d) => update(d.url, { included: true }))}>Tick shown</Button>
              <Button size="small" onClick={() => shown.forEach((d) => update(d.url, { included: false }))}>Untick shown</Button>
            </Stack>
            <Box sx={{ maxHeight: 420, overflow: "auto", border: 1, borderColor: "divider", borderRadius: 3, px: 2, py: 1 }}>
              {shown.map((d) => (
                <FormControlLabel key={d.url} sx={{ display: "flex" }} control={<Checkbox checked={d.included} onChange={(e) => update(d.url, { included: e.target.checked })} />} label={<Typography variant="body2">{d.path}</Typography>} />
              ))}
              {!shown.length && <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>No pages match</Typography>}
            </Box>
            <Stack direction="row" spacing={1}>
              {!existing && <Button onClick={() => setStep(0)}>Back</Button>}
              <Button variant="contained" disabled={!included.length} onClick={() => setStep(2)}>Next</Button>
            </Stack>
          </Stack>
        )}

        {step === 2 && (
          <Stack spacing={3}>
            <TextField label="Search terms, one per line" multiline minRows={6} maxRows={14} value={termsText} onChange={(e) => setTermsText(e.target.value)} helperText={`${terms.length} terms`} sx={{ maxWidth: 560 }} />
            {included.map((d) => (
              <Box key={d.url} sx={{ border: 1, borderColor: "divider", borderRadius: 3, p: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1.5 }}>{d.path}</Typography>
                <Stack spacing={2}>
                  <TextField label="Intent statement" placeholder="The question this page must answer" value={d.intent} onChange={(e) => update(d.url, { intent: e.target.value })} size="small" />
                  <Autocomplete
                    multiple
                    options={terms}
                    value={d.expected}
                    onChange={(_, v) => update(d.url, { expected: v.slice(0, 10) })}
                    filterSelectedOptions
                    renderTags={(value, getTagProps) => value.map((t, i) => <Chip size="small" label={`${i + 1}. ${t}`} {...getTagProps({ index: i })} key={t} />)}
                    renderInput={(p) => <TextField {...p} size="small" label={`Expected terms in order (${d.expected.length} of 10)`} />}
                  />
                </Stack>
              </Box>
            ))}
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setStep(1)}>Back</Button>
              <Button variant="contained" onClick={() => setStep(3)}>Next</Button>
            </Stack>
          </Stack>
        )}

        {step === 3 && (
          <Stack spacing={2} sx={{ maxWidth: 640 }}>
            <Typography variant="body1">{name || domain} · {included.length} pages · {terms.length} terms</Typography>
            {problems.length ? (
              <Alert severity="warning">
                Fix these before calibrating:
                <Box component="ul" sx={{ m: 0, pl: 2 }}>{problems.slice(0, 12).map((p) => <li key={p}>{p}</li>)}</Box>
              </Alert>
            ) : (
              <Alert severity="info">Calibration runs every page 100 times on both scopes: {included.length * 2 * 100 * 2} Jev requests. You can pause and resume.</Alert>
            )}
            <Stack direction="row" spacing={1}>
              <Button onClick={() => setStep(2)}>Back</Button>
              <Button variant="outlined" disabled={busy} onClick={() => save(false)}>Save</Button>
              <Button variant="contained" disabled={busy || problems.length > 0} onClick={() => save(true)}>Save and calibrate</Button>
            </Stack>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

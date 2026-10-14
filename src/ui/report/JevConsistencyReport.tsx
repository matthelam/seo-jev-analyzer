"use client";

import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Link from "@mui/material/Link";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import data from "@/data/jev-consistency-2026-10-14.json";
import { DeviationStrip, Convergence, EditEffect, NoiseSource, type PageRow } from "./charts";
import { DataTable, Figure, f2, f3, signed } from "./vizkit";

type Session2 = { gapMinutes: number; runs: number; requests: number; beyondFloor: number; rows: { id: string; scope: string; s1: number; s2: number; diff: number }[]; maxAbsDiff: number };
type Data = Omit<typeof data, "session2"> & { session2: null | Session2 };
const d = data as Data;
const pages = d.pages as unknown as (PageRow & (typeof data)["pages"][number])[];

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <Card variant="outlined" sx={{ flex: "1 1 200px" }}>
      <CardContent>
        <Typography sx={{ fontSize: 36, fontWeight: 500, lineHeight: 1.1 }}>{value}</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{label}</Typography>
      </CardContent>
    </Card>
  );
}

export function JevConsistencyReport() {
  const allSd = pages.flatMap((p) => [p.meta.sd, p.page.sd]);
  const maxSd = Math.max(...allSd);
  const within = pages.flatMap((p) => [p.meta.dev, p.page.dev]).map((dev) => dev.filter((x) => Math.abs(x) <= d.noiseFloor).length / dev.length);
  const withinAll = within.reduce((a, b) => a + b, 0) / within.length, withinWorst = Math.min(...within);
  const pct = (x: number) => `${(100 * x).toFixed(x === 1 ? 0 : 1).replace(/\.0$/, "")}%`;
  const clusters = pages.flatMap((p) => [p.meta.clusters, p.page.clusters]).filter(Boolean).length;
  const edits = pages.flatMap((p) => [p.improved.delta, p.degraded.delta]);
  // A change carries the noise of both scores: threshold = floor x sqrt(1/nA + 1/nB).
  const single = d.noiseFloor * Math.SQRT2;
  const averaged = d.noiseFloor * Math.sqrt(1 / d.variantRuns + 1 / d.runs);
  const clear = edits.filter((x) => Math.abs(x) > single).length;
  const clearAveraged = edits.filter((x) => Math.abs(x) > averaged).length;
  const subFloor = edits.filter((x) => Math.abs(x) <= single).sort((a, b) => Math.abs(a) - Math.abs(b));
  const one = d.convergence.find((c) => c.n === 1)!, five = d.convergence.find((c) => c.n === 5)!;
  const scatter = d.scatter.map((s) => ({ ...s, label: pages.find((p) => p.id === s.id)!.label }));
  const s2 = d.session2;
  const noise = {
    lo: Math.max(...scatter.filter((p) => p.fit < 0.15).map((p) => p.sd)),
    hiMax: Math.max(...scatter.filter((p) => p.fit < 0.15 || p.fit >= 0.9).map((p) => p.sd)),
  };

  return (
    <Box component="article" sx={{ maxWidth: 1040, "& p": { maxWidth: 760 } }}>
      <Typography variant="overline" color="text.secondary">
        <Link href="/guide" underline="hover" color="inherit">Guide</Link> · Report · {d.date}
      </Typography>
      <Typography variant="h3" component="h1" gutterBottom>Jev Consistency Report</Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom>
        {(d.requests + (s2?.requests ?? 0)).toLocaleString()} Jev requests · 10 public websites · {d.runs} repeats per score · {d.model} · question set {d.questionVersion}
      </Typography>
      <Typography variant="body1" sx={{ my: 2 }}>
        <strong>Jev returns nearly the same score every time.</strong> We froze the text of 10 public pages, so only Jev could vary, and scored each page {d.runs} times on both the metadata score and the page score.
      </Typography>

      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", my: 3 }}>
        <Tile value={f3(maxSd)} label="Largest standard deviation of any score, on a 0 to 10 scale" />
        <Tile value={pct(withinAll)} label={`of single runs land within ±${f2(d.noiseFloor)} of their 100-run mean; ${pct(withinWorst)} on the noisiest page`} />
        <Tile value={`${clusters} of 20`} label="Scores that split into two clusters" />
        <Tile value={`${clear} of ${edits.length}`} label={`Metadata edits detectable from a single run before and after (beyond ±${f2(single)})`} />
      </Box>

      <Typography variant="h5" component="h2" sx={{ mt: 5 }}>1. Repeat runs barely move</Typography>
      <Figure n={1} title="Every run's distance from its page's mean" note="Each dot is one run. The grey bar is ± 2 SD. The black sliver above shows how small this window is on the full scale.">
        <DeviationStrip pages={pages} />
      </Figure>
      <DataTable
        head={["Page", "Metadata mean", "SD", "Page mean", "SD", "Intent fit SD (page)", "Top-10 terms kept, worst run"]}
        rows={pages.map((p) => [p.label, f2(p.meta.mean), f3(p.meta.sd), f2(p.page.mean), f3(p.page.sd), f3(p.page.fitSd), `${Math.min(p.meta.top10Min, p.page.top10Min)} of 10`])}
      />

      <Typography variant="h5" component="h2" sx={{ mt: 5 }}>2. One run is enough</Typography>
      <Typography variant="body1">
        Pooled across pages, 95% of single runs land within ±{f2(d.scopes.page.err95)} of the 100-run mean (±{f2(d.scopes.meta.err95)} for metadata). On the noisiest page one run has an SD of {f3(one.worst)}; averaging five runs halves it to {f3(five.worst)}.
      </Typography>
      <Figure n={2} title="Spread of a score made from n runs" table={{ head: ["Runs averaged", "Noisiest page SD", "Median page SD"], rows: d.convergence.map((c) => [c.n, f3(c.worst), f3(c.median)]) }}>
        <Convergence points={d.convergence} floor={d.noiseFloor} />
      </Figure>

      <Typography variant="h5" component="h2" sx={{ mt: 5 }}>3. Real edits stand far above the noise</Typography>
      <Typography variant="body1">
        We made two edits to each page's metadata and scored each {d.variantRuns} times: an empty description with a one-word title, and a description rewritten to answer the intent. A change carries the noise of both scores, so its threshold is the floor × √(1/runs + 1/runs before). Averaging {d.variantRuns} runs against {d.runs}, the threshold is ±{f3(averaged)} and {clearAveraged} of {edits.length} edits clear it. From one run before and one after, it is ±{f2(single)}: {clear} of {edits.length} clear it; the other {subFloor.length} moved the score by {subFloor.map((x) => signed(x)).join(", ")}.
      </Typography>
      <Figure n={3} title="Metadata score: stripped, live and rewritten" table={{ head: ["Page", "Stripped", "Live", "Rewritten", "Change, stripped", "Change, rewritten"], rows: pages.map((p) => [p.label, f2(p.degraded.mean), f2(p.meta.mean), f2(p.improved.mean), signed(p.degraded.delta), signed(p.improved.delta)]) }}>
        <EditEffect pages={pages} floor={single} />
      </Figure>

      <Typography variant="h5" component="h2" sx={{ mt: 5 }}>4. Where the remaining noise comes from</Typography>
      <Typography variant="body1">
        Noise is lowest when a page does not answer its intent (SD at most {f3(noise.lo)} for intent fit below 0.15). Every SD above {f3(noise.hiMax)} comes from a partial answer, intent fit between 0.15 and 0.9, where Jev spreads its probability across levels.
      </Typography>
      <Figure n={4} title="Score SD against intent fit" table={{ head: ["Page", "Score", "Intent fit", "Score SD"], rows: scatter.map((s) => [s.label, `${s.scope === "meta" ? "metadata" : "page"}${s.cond === "base" ? "" : s.cond === "improved" ? ", rewritten" : ", stripped"}`, f2(s.fit), f3(s.sd)]) }}>
        <NoiseSource points={scatter} />
      </Figure>

      <Typography variant="h5" component="h2" sx={{ mt: 5 }}>5. Rankings and time</Typography>
      <DataTable
        head={["Check", "Metadata score", "Page score"]}
        rows={[
          ["Runs ranking the 10 pages in the same order as the mean", `${d.ranking.meta.identicalOrder} of 100`, `${d.ranking.page.identicalOrder} of 100`],
          ["Lowest rank agreement in any run (Kendall's τ)", f2(d.ranking.meta.minTau), f2(d.ranking.page.minTau)],
          ["Page pairs that ever swapped places", `${d.ranking.meta.swappedPairs} of 45`, `${d.ranking.page.swappedPairs} of 45`],
          ["Widest gap between two pages that swapped", f3(d.ranking.meta.maxSwapGap), f3(d.ranking.page.maxSwapGap)],
          ["Drift, first 50 runs vs last 50 (largest page)", f3(d.ranking.meta.drift), f3(d.ranking.page.drift)],
          ...(s2 ? [[`Session ${s2.gapMinutes} minutes later, ${s2.runs} runs: largest change in a page mean`, f3(Math.max(...s2.rows.filter((r) => r.scope === "meta").map((r) => Math.abs(r.diff)))), f3(Math.max(...s2.rows.filter((r) => r.scope === "page").map((r) => Math.abs(r.diff))))]] : []),
        ]}
      />
      <Typography variant="body1">
        Pages only swapped places when their means were at most {f3(Math.max(d.ranking.meta.maxSwapGap, d.ranking.page.maxSwapGap))} apart, inside the noise floor.
        {s2 && ` ${s2.gapMinutes} minutes later, ${s2.runs} more runs per score moved no page mean by more than ${f3(s2.maxAbsDiff)}; ${s2.beyondFloor} of 20 moved beyond the floor.`}
      </Typography>

      <Typography variant="h5" component="h2" sx={{ mt: 5 }}>6. What this means for the tool</Typography>
      <DataTable
        head={["Before", "Evidence", "Now"]}
        text={[1, 2]}
        rows={[
          ["100-run calibration per profile before the first score", `Largest SD ${f3(maxSd)}`, `One noise floor per Jev version: ±${f2(d.noiseFloor)} (2 × largest SD)`],
          ["Band taken from each profile's calibration", `${clear} of ${edits.length} edits detectable from single runs`, `Each score ±${f2(d.noiseFloor)}; a change between two single runs is level within ±${f2(d.noiseFloor * Math.SQRT2)}, since both carry noise`],
          ["Calibration costs 4 requests × 100 runs per page", `${pct(withinAll)} of single runs within ±${f2(d.noiseFloor)}; noisiest page ${pct(withinWorst)}`, "Default 1 run per score; up to 10 when two scores are close"],
        ]}
      />

      <Typography variant="h5" component="h2" sx={{ mt: 5 }}>Method</Typography>
      <DataTable
        head={["Item", "Value"]}
        text={[1]}
        rows={[
          ["Pages", "10 public pages, one per site, chosen across 10 kinds of site; text fetched once and frozen"],
          ["Inputs per page", "One intent statement; 30 terms, 10 of them expected; same questions as the app"],
          ["Runs", `${d.runs} per page per score; ${d.variantRuns} per edited version; run in rotation so time spreads evenly`],
          ["Requests", `${d.requests.toLocaleString()}${s2 ? ` plus ${s2.requests.toLocaleString()} in the second session` : ""}; every answer from ${d.model}; ${(d.tokensIn / 1e6).toFixed(1)}M input tokens; median ${Math.round(d.medianPairMs)} ms per pair`],
          ["Window", `${d.first.slice(11, 16)} to ${d.last.slice(11, 16)} UTC, ${d.date}${s2 ? `; second session ${s2.gapMinutes} minutes later` : ""}`],
        ]}
      />
      <DataTable
        head={["Page", "Kind", "Intent", "Body text"]}
        text={[1, 2]}
        rows={pages.map((p) => [<Link key={p.id} href={p.url} target="_blank" rel="noopener">{p.label}</Link>, p.kind, p.intent, `${p.bodyChars.toLocaleString()} chars`])}
      />

      <Typography variant="h5" component="h2" sx={{ mt: 5 }}>Limits</Typography>
      <Box component="ul" sx={{ maxWidth: 760, "& li": { mb: 0.5 } }}>
        <li>One Jev version, one question set and one day. A new version needs its own noise floor.</li>
        <li>Ten English-language pages. A noisier page type may exist; the floor uses the largest SD seen, not the average.</li>
        <li>This measures consistency, not correctness. Whether Jev's judgement matches people's is a separate test.</li>
      </Box>
    </Box>
  );
}

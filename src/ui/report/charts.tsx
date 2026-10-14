"use client";

// Charts for the Jev consistency report. Metadata score = series 1, page score = series 2, everywhere.

import Box from "@mui/material/Box";
import { HoverFrame, Legend, useViz, f2, f3, signed } from "./vizkit";

export type ScopeStats = { mean: number; sd: number; min: number; max: number; fitMean: number; fitSd: number; dev: number[] };
export type PageRow = { id: string; label: string; meta: ScopeStats; page: ScopeStats; improved: { mean: number; sd: number; delta: number }; degraded: { mean: number; sd: number; delta: number } };

const short = (s: string) => (s.length > 30 ? s.slice(0, 29) + "…" : s);
// Deterministic vertical jitter so 100 dots in a row show their density.
const jitter = (i: number) => (((i * 7919) % 97) / 97 - 0.5) * 8;

/** Figure: every run's distance from its own 100-run mean, per page and scope. */
export function DeviationStrip({ pages, range = 0.25 }: { pages: PageRow[]; range?: number }) {
  const c = useViz();
  const W = 1000, left = 210, right = 24, top = 92, sub = 16, gap = 12;
  const rowH = sub * 2 + gap;
  const H = top + pages.length * rowH + 30;
  const X = (v: number) => left + ((v + range) / (2 * range)) * (W - left - right);
  // Context bar: the whole 0-10 scale with this chart's window marked.
  const cx = (v: number) => left + (v / 10) * (W - left - right);
  const mid = 5;
  return (
    <HoverFrame>
      {(show, hide) => (
        <Box sx={{ overflowX: "auto" }}>
          <Legend items={[
            { label: "Metadata score", mark: <circle cx="7" cy="7" r="4" fill={c.s1} /> },
            { label: "Page score", mark: <circle cx="7" cy="7" r="4" fill={c.s2} /> },
            { label: "± 2 SD", mark: <rect x="1" y="3" width="12" height="8" rx="2" fill={c.band} /> },
          ]} />
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Deviation of each of 100 runs from the page's mean score" style={{ minWidth: 640, maxWidth: W, display: "block" }}>
            <text x={8} y={22} fontSize={12} fill={c.muted}>Full score scale</text>
            <line x1={cx(0)} x2={cx(10)} y1={18} y2={18} stroke={c.grid} strokeWidth={6} strokeLinecap="round" />
            <rect x={cx(mid - range)} y={13} width={cx(mid + range) - cx(mid - range)} height={10} rx={2} fill={c.ink} />
            {[0, 10].map((v) => <text key={v} x={cx(v)} y={40} fontSize={11} textAnchor="middle" fill={c.muted}>{v}</text>)}
            <text x={cx(mid)} y={40} fontSize={11} textAnchor="middle" fill={c.ink}>this chart's full width: {2 * range} points</text>
            {[-0.2, -0.1, 0, 0.1, 0.2].map((v) => (
              <g key={v}>
                <line x1={X(v)} x2={X(v)} y1={top - 8} y2={H - 26} stroke={c.grid} strokeWidth={v === 0 ? 1.5 : 1} />
                <text x={X(v)} y={H - 8} fontSize={11} textAnchor="middle" fill={c.muted}>{v === 0 ? "mean" : signed(v, 1)}</text>
              </g>
            ))}
            <text x={X(0)} y={top - 14} fontSize={11} textAnchor="middle" fill={c.muted}>distance from the page's 100-run mean</text>
            {pages.map((p, i) => {
              const y0 = top + i * rowH;
              return (
                <g key={p.id}>
                  <text x={8} y={y0 + sub + 4} fontSize={12.5} fill={c.ink}>{short(p.label)}</text>
                  {(["meta", "page"] as const).map((sc, k) => {
                    const s = p[sc], y = y0 + k * sub + sub / 2, col = k ? c.s2 : c.s1;
                    return (
                      <g key={sc}>
                        <rect x={X(-2 * s.sd)} y={y - 6} width={X(2 * s.sd) - X(-2 * s.sd)} height={12} rx={3} fill={c.band} />
                        {s.dev.map((d, j) => <circle key={j} cx={X(d)} cy={y + jitter(j) * 0.6} r={2.6} fill={col} fillOpacity={0.5} />)}
                        <rect
                          x={left} y={y - 7} width={W - left - right} height={14} fill="transparent" tabIndex={0}
                          onMouseMove={(e) => show(e, `${p.label}, ${sc === "meta" ? "metadata" : "page"} score\nmean ${f2(s.mean)} · SD ${f3(s.sd)}\nrange ${f2(s.min)} to ${f2(s.max)}`)}
                          onFocus={(e) => show(e, `${p.label}, ${sc} SD ${f3(s.sd)}`)} onBlur={hide}
                        />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </Box>
      )}
    </HoverFrame>
  );
}

/** Figure: how much averaging several runs narrows the spread. */
export function Convergence({ points, floor }: { points: { n: number; worst: number; median: number }[]; floor: number }) {
  const c = useViz();
  const W = 640, H = 300, left = 56, right = 150, top = 20, bottom = 40;
  const ns = points.map((p) => p.n);
  const X = (n: number) => left + (Math.log(n) / Math.log(ns[ns.length - 1])) * (W - left - right);
  const yMax = 0.1;
  const Y = (v: number) => top + (1 - v / yMax) * (H - top - bottom);
  const path = (k: "worst" | "median") => points.map((p, i) => `${i ? "L" : "M"}${X(p.n)},${Y(p[k])}`).join(" ");
  const last = points[points.length - 1];
  return (
    <HoverFrame>
      {(show, hide) => (
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Standard deviation of the mean of n runs" style={{ maxWidth: W, display: "block" }}>
          {[0, 0.025, 0.05, 0.075, 0.1].map((v) => (
            <g key={v}>
              <line x1={left} x2={W - right} y1={Y(v)} y2={Y(v)} stroke={c.grid} />
              <text x={left - 8} y={Y(v) + 4} fontSize={11} textAnchor="end" fill={c.muted}>{v.toFixed(3)}</text>
            </g>
          ))}
          {ns.map((n) => <text key={n} x={X(n)} y={H - 16} fontSize={11} textAnchor="middle" fill={c.muted}>{n}</text>)}
          <text x={(left + W - right) / 2} y={H - 2} fontSize={11} textAnchor="middle" fill={c.muted}>runs averaged per score</text>
          {(["worst", "median"] as const).map((k) => (
            <g key={k}>
              <path d={path(k)} fill="none" stroke={k === "worst" ? c.ink : c.muted} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              {points.map((p) => (
                <circle key={p.n} cx={X(p.n)} cy={Y(p[k])} r={4.5} fill={k === "worst" ? c.ink : c.muted} stroke={c.surface} strokeWidth={2} tabIndex={0}
                  onMouseMove={(e) => show(e, `${p.n} run${p.n > 1 ? "s" : ""}: SD ${f3(p[k])} (${k === "worst" ? "noisiest page" : "median page"})`)}
                  onFocus={(e) => show(e, `${p.n} runs: SD ${f3(p[k])}`)} onBlur={hide} />
              ))}
              <text x={X(last.n) + 10} y={Y(last[k]) + (k === "worst" ? -2 : 12)} fontSize={12} fill={c.ink}>{k === "worst" ? "Noisiest of 20" : "Median of 20"}</text>
            </g>
          ))}
          <text x={X(1) + 10} y={Y(points[0].worst) - 8} fontSize={12} fill={c.ink}>{f3(points[0].worst)}</text>
          <text x={X(1) + 10} y={Y(points[0].median) - 8} fontSize={12} fill={c.muted}>{f3(points[0].median)}</text>
        </svg>
      )}
    </HoverFrame>
  );
}

/** Figure: metadata score before and after two edits, against the noise floor. */
export function EditEffect({ pages, floor }: { pages: PageRow[]; floor: number }) {
  const c = useViz();
  const W = 1000, left = 210, right = 170, top = 16, rowH = 30;
  const H = top + pages.length * rowH + 30;
  const X = (v: number) => left + (v / 10) * (W - left - right);
  const tag = (d: number) => (Math.abs(d) <= floor ? `${signed(d)} level` : signed(d));
  return (
    <HoverFrame>
      {(show, hide) => (
        <Box sx={{ overflowX: "auto" }}>
          <Legend items={[
            { label: "One-word title, no description", mark: <circle cx="7" cy="7" r="4" fill="none" stroke={c.ink} strokeWidth="2" /> },
            { label: "Live metadata", mark: <circle cx="7" cy="7" r="4.5" fill={c.s1} /> },
            { label: "Description rewritten to answer the intent", mark: <rect x="3" y="3" width="8" height="8" fill={c.ink} transform="rotate(45 7 7)" /> },
          ]} />
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Metadata score before and after edits" style={{ minWidth: 640, maxWidth: W, display: "block" }}>
            {[0, 2, 4, 6, 8, 10].map((v) => (
              <g key={v}>
                <line x1={X(v)} x2={X(v)} y1={top - 6} y2={H - 26} stroke={c.grid} />
                <text x={X(v)} y={H - 8} fontSize={11} textAnchor="middle" fill={c.muted}>{v}</text>
              </g>
            ))}
            <text x={W - right + 12} y={top + 4} fontSize={11} fill={c.muted}>stripped · rewritten</text>
            {pages.map((p, i) => {
              const y = top + 14 + i * rowH;
              const xs = [p.degraded.mean, p.meta.mean, p.improved.mean];
              const tipText = `${p.label}\nstripped ${f2(p.degraded.mean)} (${signed(p.degraded.delta)})\nlive ${f2(p.meta.mean)} ± ${f2(2 * p.meta.sd)}\nrewritten ${f2(p.improved.mean)} (${signed(p.improved.delta)})`;
              return (
                <g key={p.id} tabIndex={0} onMouseMove={(e) => show(e, tipText)} onFocus={(e) => show(e, tipText)} onBlur={hide}>
                  <rect x={0} y={y - rowH / 2} width={W} height={rowH} fill="transparent" />
                  <text x={8} y={y + 4} fontSize={12.5} fill={c.ink}>{short(p.label)}</text>
                  <line x1={X(Math.min(...xs))} x2={X(Math.max(...xs))} y1={y} y2={y} stroke={c.outline} strokeWidth={2} />
                  <circle cx={X(p.degraded.mean)} cy={y} r={5} fill={c.surface} stroke={c.ink} strokeWidth={2} />
                  <rect x={X(p.improved.mean) - 4.5} y={y - 4.5} width={9} height={9} fill={c.ink} stroke={c.surface} strokeWidth={1.5} transform={`rotate(45 ${X(p.improved.mean)} ${y})`} />
                  <circle cx={X(p.meta.mean)} cy={y} r={5.5} fill={c.s1} stroke={c.surface} strokeWidth={2} />
                  <text x={W - right + 12} y={y + 4} fontSize={12} fill={c.ink} style={{ fontVariantNumeric: "tabular-nums" }}>
                    {tag(p.degraded.delta)} · {tag(p.improved.delta)}
                  </text>
                </g>
              );
            })}
          </svg>
        </Box>
      )}
    </HoverFrame>
  );
}

/** Figure: score SD against mean intent fit. */
export function NoiseSource({ points }: { points: { id: string; label: string; cond: string; scope: string; fit: number; sd: number }[] }) {
  const c = useViz();
  const W = 640, H = 320, left = 56, right = 20, top = 16, bottom = 44;
  const X = (v: number) => left + v * (W - left - right);
  const Y = (v: number) => top + (1 - v / 0.1) * (H - top - bottom);
  return (
    <HoverFrame>
      {(show, hide) => (
        <>
          <Legend items={[
            { label: "Metadata, live", mark: <circle cx="7" cy="7" r="4.5" fill={c.s1} /> },
            { label: "Page, live", mark: <circle cx="7" cy="7" r="4.5" fill={c.s2} /> },
            { label: "Metadata, edited", mark: <circle cx="7" cy="7" r="4" fill="none" stroke={c.s1} strokeWidth="2" /> },
          ]} />
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Score standard deviation against mean intent fit" style={{ maxWidth: W, display: "block" }}>
            {[0, 0.025, 0.05, 0.075, 0.1].map((v) => (
              <g key={v}>
                <line x1={left} x2={W - right} y1={Y(v)} y2={Y(v)} stroke={c.grid} />
                <text x={left - 8} y={Y(v) + 4} fontSize={11} textAnchor="end" fill={c.muted}>{v.toFixed(3)}</text>
              </g>
            ))}
            {[0, 0.25, 0.5, 0.75, 1].map((v) => <text key={v} x={X(v)} y={H - 24} fontSize={11} textAnchor="middle" fill={c.muted}>{v}</text>)}
            <text x={(left + W - right) / 2} y={H - 6} fontSize={11} textAnchor="middle" fill={c.muted}>mean intent fit (0 = does not answer, 1 = answers fully)</text>
            <text x={left} y={top - 4} fontSize={11} fill={c.muted}>score SD</text>
            {points.map((p, i) => {
              const col = p.scope === "page" ? c.s2 : c.s1;
              const hollow = p.cond !== "base";
              const t = `${p.label}, ${p.scope === "meta" ? "metadata" : "page"}${hollow ? ` (${p.cond === "improved" ? "rewritten" : "stripped"})` : ""}\nintent fit ${f2(p.fit)} · score SD ${f3(p.sd)}`;
              return (
                <circle key={i} cx={X(p.fit)} cy={Y(p.sd)} r={5} fill={hollow ? c.surface : col} stroke={hollow ? col : c.surface} strokeWidth={2} tabIndex={0}
                  onMouseMove={(e) => show(e, t)} onFocus={(e) => show(e, t)} onBlur={hide} />
              );
            })}
          </svg>
        </>
      )}
    </HoverFrame>
  );
}

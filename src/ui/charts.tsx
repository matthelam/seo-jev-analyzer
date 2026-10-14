"use client";

// Custom SVG charts following the spec's data-visualisation rules:
// one dot per score with a horizontal band (the noise floor); metadata in series 1, page in series 2; labelled, not colour alone.

import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Tooltip from "@mui/material/Tooltip";

export type BandRow = { id: string; label: string; meta?: { score: number; band: number }; page?: { score: number; band: number } };

export function BandChart({ rows, onSelect }: { rows: BandRow[]; onSelect?: (id: string) => void }) {
  const t = useTheme();
  const primary = t.vars?.palette.viz.series1 ?? t.palette.viz.series1;
  const tertiary = t.vars?.palette.viz.series2 ?? t.palette.viz.series2;
  const grid = t.vars?.palette.m3.outlineVariant ?? t.palette.m3.outlineVariant;
  const quiet = t.vars?.palette.text.secondary ?? t.palette.text.secondary;
  const W = 1100, left = 240, right = 24, rowH = 28, top = 28;
  const H = top + rows.length * rowH + 28;
  const X = (v: number) => left + (Math.max(0, Math.min(10, v)) / 10) * (W - left - right);
  const series = (row: BandRow, key: "meta" | "page", color: string, dy: number) => {
    const s = row[key];
    if (!s) return null;
    const y = top + rows.indexOf(row) * rowH + rowH / 2 + dy;
    return (
      <Tooltip key={key} title={`${key === "meta" ? "Metadata" : "Page"} score ${s.score.toFixed(2)} ± ${s.band.toFixed(2)}`}>
        <g>
          <line x1={X(s.score - s.band)} x2={X(s.score + s.band)} y1={y} y2={y} stroke={color} strokeWidth={6} strokeOpacity={0.3} strokeLinecap="round" />
          <circle cx={X(s.score)} cy={y} r={4.5} fill={color} />
        </g>
      </Tooltip>
    );
  };
  return (
    <Box sx={{ overflowX: "auto" }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Score by page with the noise floor as a band" style={{ minWidth: 560, maxWidth: W, display: "block" }}>
        {[0, 2, 4, 6, 8, 10].map((v) => (
          <g key={v}>
            <line x1={X(v)} x2={X(v)} y1={top - 6} y2={H - 22} stroke={grid} />
            <text x={X(v)} y={H - 6} textAnchor="middle" fontSize={11} fill={quiet}>{v}</text>
          </g>
        ))}
        <circle cx={left} cy={12} r={4.5} fill={primary} />
        <text x={left + 10} y={16} fontSize={12} fill={quiet}>Metadata score</text>
        <circle cx={left + 130} cy={12} r={4.5} fill={tertiary} />
        <text x={left + 140} y={16} fontSize={12} fill={quiet}>Page score</text>
        {rows.map((r, i) => (
          <g key={r.id} style={{ cursor: onSelect ? "pointer" : undefined }} onClick={() => onSelect?.(r.id)}>
            <rect x={0} y={top + i * rowH} width={W} height={rowH} fill="transparent" />
            <text x={8} y={top + i * rowH + rowH / 2 + 4} fontSize={12.5} fill="currentColor">{r.label.length > 34 ? r.label.slice(0, 33) + "…" : r.label}</text>
            {series(r, "meta", primary, -4)}
            {series(r, "page", tertiary, 4)}
          </g>
        ))}
      </svg>
    </Box>
  );
}

export function TermChart({ items }: { items: { term: string; rating: number }[] }) {
  const t = useTheme();
  const primary = t.vars?.palette.primary.main ?? t.palette.primary.main;
  const outline = t.vars?.palette.m3.outline ?? t.palette.m3.outline;
  return (
    <Box component="ol" sx={{ listStyle: "none", p: 0, m: 0, display: "grid", gap: 1 }} aria-label="Term ratings">
      {items.map((it, i) => (
        <Box component="li" key={it.term} sx={{ display: "grid", gridTemplateColumns: "20px 1fr 48px", gap: 1, alignItems: "center" }}>
          <Typography variant="caption" color="text.secondary">{i + 1}</Typography>
          <Box>
            <Typography variant="body2" sx={{ mb: 0.25 }}>{it.term}</Typography>
            <Box sx={{ height: 8, borderRadius: 1, border: `1px solid ${outline}`, position: "relative", overflow: "hidden" }}>
              <Box sx={{ position: "absolute", inset: 0, width: `${Math.round(it.rating * 100)}%`, bgcolor: primary }} />
            </Box>
          </Box>
          <Typography variant="body2" sx={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{it.rating.toFixed(2)}</Typography>
        </Box>
      ))}
    </Box>
  );
}

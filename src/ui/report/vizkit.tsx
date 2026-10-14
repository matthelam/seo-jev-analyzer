"use client";

// Small shared pieces for report charts: colour roles, a hover tooltip layer, figure frame and data table toggle.

import { useRef, useState, type ReactNode } from "react";
import { useTheme } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

export function useViz() {
  const t = useTheme();
  const v = (a: string | undefined, b: string) => a ?? b;
  return {
    s1: v(t.vars?.palette.viz.series1, t.palette.viz.series1), // metadata score
    s2: v(t.vars?.palette.viz.series2, t.palette.viz.series2), // page score
    ink: v(t.vars?.palette.text.primary, t.palette.text.primary),
    muted: v(t.vars?.palette.text.secondary, t.palette.text.secondary),
    grid: v(t.vars?.palette.m3.outlineVariant, t.palette.m3.outlineVariant),
    outline: v(t.vars?.palette.m3.outline, t.palette.m3.outline),
    surface: v(t.vars?.palette.background.paper, t.palette.background.paper),
    band: v(t.vars?.palette.m3.surfaceVariant, t.palette.m3.surfaceVariant),
  };
}

export type Tip = { x: number; y: number; text: string } | null;

/** Wraps an SVG; marks call show(event, text) on hover or focus. */
export function HoverFrame({ children }: { children: (show: (e: React.MouseEvent | React.FocusEvent, text: string) => void, hide: () => void) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip>(null);
  const show = (e: React.MouseEvent | React.FocusEvent, text: string) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    const src = "clientX" in e ? { x: e.clientX, y: e.clientY } : (() => { const r = (e.target as Element).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y }; })();
    setTip({ x: src.x - box.left, y: src.y - box.top, text });
  };
  return (
    <Box ref={ref} sx={{ position: "relative" }} onMouseLeave={() => setTip(null)}>
      {children(show, () => setTip(null))}
      {tip && (
        <Box
          role="status"
          sx={{
            position: "absolute", left: tip.x, top: tip.y - 12, transform: "translate(-50%, -100%)", pointerEvents: "none",
            bgcolor: "text.primary", color: "background.paper", px: 1, py: 0.5, borderRadius: 1, fontSize: 12, whiteSpace: "pre", zIndex: 2,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {tip.text}
        </Box>
      )}
    </Box>
  );
}

export function Figure({ n, title, note, children, table }: { n: number; title: string; note?: string; children: ReactNode; table?: { head: string[]; rows: (string | number)[][] } }) {
  return (
    <Box component="figure" sx={{ m: 0, my: 4 }}>
      <Typography variant="h6" component="h3">Figure {n}. {title}</Typography>
      {note && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{note}</Typography>}
      {children}
      {table && (
        <Box component="details" sx={{ mt: 1, "& summary": { cursor: "pointer", color: "text.secondary", fontSize: 14 } }}>
          <summary>Figure {n} as a table</summary>
          <DataTable head={table.head} rows={table.rows} />
        </Box>
      )}
    </Box>
  );
}

export function DataTable({ head, rows, dense = true, text = [] }: { head: string[]; rows: (string | number | ReactNode)[][]; dense?: boolean; text?: number[] }) {
  const al = (j: number) => (j === 0 || text.includes(j) ? "left" : "right");
  return (
    <Box sx={{ overflowX: "auto", my: 1 }}>
      <Table size={dense ? "small" : "medium"} sx={{ "& td, & th": { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } }}>
        <TableHead>
          <TableRow>{head.map((h, i) => <TableCell key={i} align={al(i)} sx={{ fontWeight: 500 }}>{h}</TableCell>)}</TableRow>
        </TableHead>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={i}>{r.map((c, j) => <TableCell key={j} align={al(j)} sx={{ whiteSpace: text.includes(j) ? "normal !important" : undefined }}>{c}</TableCell>)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}

export function Legend({ items }: { items: { label: string; mark: ReactNode }[] }) {
  return (
    <Box sx={{ display: "flex", gap: 2.5, flexWrap: "wrap", mb: 1 }} aria-hidden>
      {items.map((it) => (
        <Box key={it.label} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
          <svg width="14" height="14" viewBox="0 0 14 14">{it.mark}</svg>
          <Typography variant="body2" color="text.secondary">{it.label}</Typography>
        </Box>
      ))}
    </Box>
  );
}

export const f2 = (x: number) => x.toFixed(2);
export const f3 = (x: number) => x.toFixed(3);
export const signed = (x: number, d = 2) => (x >= 0 ? "+" : "−") + Math.abs(x).toFixed(d);

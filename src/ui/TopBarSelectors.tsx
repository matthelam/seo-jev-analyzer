"use client";

import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import ListSubheader from "@mui/material/ListSubheader";
import Divider from "@mui/material/Divider";
import Box from "@mui/material/Box";
import { useRouter } from "next/navigation";
import { useApp } from "./AppState";

const date = (t: number) => new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function TopBarSelectors() {
  const { profiles, profile, runs, run, selectProfile, selectRun } = useApp();
  const router = useRouter();
  if (!profiles?.length) return null;
  const complete = runs?.filter((r) => r.status === "complete") ?? [];
  return (
    <Box sx={{ display: { xs: "none", md: "flex" }, gap: 1.5 }}>
      <Select
        size="small"
        value={profile?.id ?? ""}
        aria-label="Profile"
        sx={{ minWidth: 200 }}
        renderValue={() => `Profile: ${profile?.name ?? ""}`}
        onChange={(e) => {
          const v = e.target.value as string;
          if (v === "__new") { router.push("/dashboard?setup=new"); return; }
          selectProfile(v);
          router.push("/dashboard");
        }}
      >
        <ListSubheader>Profiles</ListSubheader>
        {profiles.map((p) => <MenuItem key={p.id} value={p.id}>{p.name} · {p.domain.replace(/^https?:\/\//, "")}</MenuItem>)}
        <Divider />
        <MenuItem value="__new">New profile or import…</MenuItem>
      </Select>
      <Select
        size="small"
        value={run?.id ?? ""}
        displayEmpty
        aria-label="Run"
        sx={{ minWidth: 220 }}
        renderValue={() => (run ? `Run: ${run.label}` : "No runs yet")}
        onChange={(e) => { selectRun(e.target.value as string); router.push("/dashboard"); }}
        disabled={!complete.length}
      >
        {complete.map((r) => <MenuItem key={r.id} value={r.id}>{r.label} · {date(r.createdAt)}</MenuItem>)}
      </Select>
    </Box>
  );
}

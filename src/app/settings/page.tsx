"use client";

import { useEffect, useState } from "react";
import { useColorScheme } from "@mui/material/styles";
import { useLiveQuery } from "dexie-react-hooks";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Slider from "@mui/material/Slider";
import Button from "@mui/material/Button";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Dialog from "@mui/material/Dialog";
import DialogTitle from "@mui/material/DialogTitle";
import DialogContent from "@mui/material/DialogContent";
import DialogActions from "@mui/material/DialogActions";
import Box from "@mui/material/Box";
import { THEME_OPTIONS } from "@/ui/ThemeModeMenu";
import { useApp } from "@/ui/AppState";
import { db, deleteProfile, deleteRun } from "@/lib/db";

const mb = (n?: number) => (n === undefined ? "–" : `${(n / 1024 / 1024).toFixed(1)} MB`);

export default function SettingsPage() {
  const { mode, setMode } = useColorScheme();
  const app = useApp();
  const [usage, setUsage] = useState<{ usage?: number; quota?: number; persisted?: boolean }>({});
  const [confirm, setConfirm] = useState<{ title: string; action: () => Promise<void> } | null>(null);
  const runs = useLiveQuery(() => db.runs.orderBy("createdAt").reverse().toArray(), []);
  const profiles = app.profiles ?? [];

  useEffect(() => {
    (async () => {
      const est = await navigator.storage?.estimate?.();
      const persisted = await navigator.storage?.persisted?.();
      setUsage({ usage: est?.usage, quota: est?.quota, persisted });
    })();
  }, [runs?.length, profiles.length]);

  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">Settings</Typography>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>Theme</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>System follows your device and changes when it does.</Typography>
          <ToggleButtonGroup exclusive value={mode ?? "system"} onChange={(_, v) => v && setMode(v)} aria-label="Theme">
            {THEME_OPTIONS.map((o) => (
              <ToggleButton key={o.value} value={o.value} sx={{ gap: 1, px: 2 }}>{o.icon}{o.label}</ToggleButton>
            ))}
          </ToggleButtonGroup>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>Parallel requests</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>How many Jev requests run at once during calibration and runs. The server default is {app.config?.concurrency ?? "–"}.</Typography>
          <Box sx={{ maxWidth: 360, px: 1 }}>
            <Slider aria-label="Parallel requests" min={1} max={16} step={1} marks value={app.concurrency} valueLabelDisplay="on" onChange={(_, v) => app.setConcurrency(v as number)} />
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>Storage</Typography>
          <Typography variant="body2">This browser holds {mb(usage.usage)} for this app{usage.quota ? ` of ${mb(usage.quota)} available` : ""}.</Typography>
          <Typography variant="body2" color="text.secondary">
            {usage.persisted ? "Persistent storage is granted: the browser will not clear it under pressure." : "Persistent storage is not granted; the browser may clear data when space runs low. Export your profiles."}
          </Typography>
        </CardContent>
      </Card>

      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>Profiles and runs</Typography>
          <List dense>
            {profiles.map((p) => (
              <Box key={p.id}>
                <ListItem secondaryAction={<Button color="error" onClick={() => setConfirm({ title: `Delete profile “${p.name}” and all its calibrations and runs?`, action: () => deleteProfile(p.id) })}>Delete profile</Button>}>
                  <ListItemText primary={p.name} secondary={p.domain} />
                </ListItem>
                {(runs ?? []).filter((r) => r.profileId === p.id).map((r) => (
                  <ListItem key={r.id} sx={{ pl: 4 }} secondaryAction={<Button size="small" onClick={() => setConfirm({ title: `Delete run “${r.label}”?`, action: () => deleteRun(r.id) })}>Delete run</Button>}>
                    <ListItemText primary={`${r.label} · ${r.status}`} secondary={new Date(r.createdAt).toLocaleString()} />
                  </ListItem>
                ))}
              </Box>
            ))}
            {!profiles.length && <Typography variant="body2" color="text.secondary">No profiles yet.</Typography>}
          </List>
        </CardContent>
      </Card>

      {app.config?.auth === "password" && (
        <Box><Button onClick={async () => { await fetch("/api/login", { method: "DELETE" }); window.location.href = "/login"; }}>Sign out</Button></Box>
      )}

      <Dialog open={!!confirm} onClose={() => setConfirm(null)}>
        <DialogTitle>{confirm?.title}</DialogTitle>
        <DialogContent><Typography variant="body2">This cannot be undone. Export the profile first if you may need it.</Typography></DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button color="error" variant="contained" onClick={async () => { await confirm?.action(); setConfirm(null); }}>Delete</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

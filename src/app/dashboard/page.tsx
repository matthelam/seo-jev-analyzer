"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import { useApp } from "@/ui/AppState";
import { SetupStepper } from "@/ui/SetupStepper";
import { DashboardView } from "@/ui/DashboardView";
import { startCalibration } from "@/lib/engine";
import { db } from "@/lib/db";

function Dashboard() {
  const app = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "new" | "edit">("view");
  useEffect(() => { if (params.get("setup") === "new") setMode("new"); }, [params]);

  if (app.profiles === undefined) return <CircularProgress sx={{ m: 4 }} aria-label="Loading" />;

  const done = async (profileId: string, calibrate: boolean) => {
    setMode("view");
    router.replace("/dashboard");
    if (calibrate && app.config && !app.config.error) {
      const profile = (await db.profiles.get(profileId))!;
      const pages = await db.pages.where({ profileId }).toArray();
      app.startJob("calibration", (onP, signal) =>
        startCalibration(profile, pages, { model: app.config!.model, questionVersion: app.config!.questionVersion, concurrency: app.concurrency }, onP, signal));
    }
  };

  if (!app.profiles.length || mode === "new") {
    return (
      <Stack spacing={3}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h4" component="h1">{app.profiles.length ? "New profile" : "Dashboard"}</Typography>
          {mode === "new" && app.profiles.length > 0 && <Button onClick={() => { setMode("view"); router.replace("/dashboard"); }}>Cancel</Button>}
        </Stack>
        {!app.profiles.length && (
          <Typography variant="body1" color="text.secondary" sx={{ maxWidth: "70ch" }}>
            A profile holds a site's pages, search terms, intent statements, calibration and runs. Set one up below, import a profile file, or load the Boulderfest example.
          </Typography>
        )}
        <SetupStepper onDone={done} />
      </Stack>
    );
  }
  if (mode === "edit" && app.profile && app.pages) {
    return (
      <Stack spacing={3}>
        <Stack direction="row" justifyContent="space-between"><Typography variant="h4" component="h1">Edit profile</Typography><Button onClick={() => setMode("view")}>Cancel</Button></Stack>
        <SetupStepper existing={{ profile: app.profile, pages: app.pages }} onDone={done} />
      </Stack>
    );
  }
  return <DashboardView onEdit={() => setMode("edit")} />;
}

export default function DashboardPage() {
  return (
    <Suspense>
      <Dashboard />
    </Suspense>
  );
}

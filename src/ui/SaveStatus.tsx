"use client";

// Shows that work is kept in this browser automatically, and confirms each finished calibration or run.

import { useEffect, useState } from "react";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Snackbar from "@mui/material/Snackbar";
import CheckCircleOutline from "@mui/icons-material/CheckCircleOutline";
import { useApp } from "./AppState";

export function SaveStatus() {
  const { profiles, notice, clearNotice } = useApp();
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [host, setHost] = useState("");

  useEffect(() => {
    setHost(window.location.host);
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null));
  }, [profiles?.length]);

  const tip = [
    "Profiles, calibrations and runs are saved in this browser as they happen. There is nothing to save by hand.",
    `Saved data belongs to ${host || "this address"} in this browser only. Another browser, a private window or another address has separate storage.`,
    persisted ? "The browser has granted persistent storage." : "The browser has not granted persistent storage, so it may clear data if disk space runs very low. Export a file if you need a backup.",
  ].join(" ");

  return (
    <>
      {!!profiles?.length && (
        <Tooltip describeChild title={tip}>
          <Chip
            icon={<CheckCircleOutline />}
            label="Saved in this browser"
            size="small"
            variant="outlined"
            sx={{ display: { xs: "none", sm: "inline-flex" } }}
          />
        </Tooltip>
      )}
      <Snackbar open={!!notice} autoHideDuration={4000} onClose={clearNotice} message={notice} anchorOrigin={{ vertical: "bottom", horizontal: "center" }} />
    </>
  );
}

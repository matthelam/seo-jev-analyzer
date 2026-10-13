"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import Stack from "@mui/material/Stack";

function LoginForm() {
  const next = useSearchParams().get("next") || "/dashboard";
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const res = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password }) });
    setBusy(false);
    if (res.ok) window.location.href = next.startsWith("/") ? next : "/dashboard";
    else setError("Wrong password");
  }
  return (
    <Card sx={{ maxWidth: 420, mx: "auto", mt: 8 }}>
      <CardContent sx={{ p: 4 }}>
        <Stack component="form" spacing={2} onSubmit={submit}>
          <Typography variant="h5" component="h1">Sign in</Typography>
          <Typography variant="body2" color="text.secondary">This deployment is password protected.</Typography>
          <TextField type="password" label="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus required autoComplete="current-password" />
          {error && <Alert severity="error">{error}</Alert>}
          <Button type="submit" variant="contained" disabled={busy || !password}>Sign in</Button>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

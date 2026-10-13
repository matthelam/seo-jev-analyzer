"use client";

import { useColorScheme } from "@mui/material/styles";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { THEME_OPTIONS } from "@/ui/ThemeModeMenu";

export default function SettingsPage() {
  const { mode, setMode } = useColorScheme();
  return (
    <Stack spacing={3}>
      <Typography variant="h4" component="h1">Settings</Typography>
      <Card>
        <CardContent sx={{ p: 3 }}>
          <Typography variant="h6" component="h2" gutterBottom>Theme</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            System follows your device and changes when it does.
          </Typography>
          <ToggleButtonGroup
            exclusive
            value={mode ?? "system"}
            onChange={(_, v) => v && setMode(v)}
            aria-label="Theme"
          >
            {THEME_OPTIONS.map((o) => (
              <ToggleButton key={o.value} value={o.value} sx={{ gap: 1, px: 2 }}>
                {o.icon}
                {o.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </CardContent>
      </Card>
    </Stack>
  );
}

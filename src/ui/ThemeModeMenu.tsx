"use client";

import { useState } from "react";
import { useColorScheme } from "@mui/material/styles";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Tooltip from "@mui/material/Tooltip";
import BrightnessAutoOutlined from "@mui/icons-material/BrightnessAutoOutlined";
import LightModeOutlined from "@mui/icons-material/LightModeOutlined";
import DarkModeOutlined from "@mui/icons-material/DarkModeOutlined";
import Check from "@mui/icons-material/Check";

export const THEME_OPTIONS = [
  { value: "system", label: "System", icon: <BrightnessAutoOutlined fontSize="small" /> },
  { value: "light", label: "Light", icon: <LightModeOutlined fontSize="small" /> },
  { value: "dark", label: "Dark", icon: <DarkModeOutlined fontSize="small" /> },
] as const;

export function ThemeModeMenu() {
  const { mode, setMode } = useColorScheme();
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  if (!mode) return null; // not yet hydrated
  const current = THEME_OPTIONS.find((o) => o.value === mode) ?? THEME_OPTIONS[0];
  return (
    <>
      <Tooltip title={`Theme: ${current.label}`}>
        <IconButton aria-label={`Theme: ${current.label}`} onClick={(e) => setAnchor(e.currentTarget)}>
          {current.icon}
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        {THEME_OPTIONS.map((o) => (
          <MenuItem key={o.value} selected={o.value === mode} onClick={() => { setMode(o.value); setAnchor(null); }}>
            <ListItemIcon>{o.icon}</ListItemIcon>
            <ListItemText>{o.label}</ListItemText>
            {o.value === mode && <Check fontSize="small" sx={{ ml: 2 }} />}
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}

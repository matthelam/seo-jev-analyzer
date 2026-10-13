"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Box from "@mui/material/Box";
import AppBar from "@mui/material/AppBar";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import ButtonBase from "@mui/material/ButtonBase";
import BottomNavigation from "@mui/material/BottomNavigation";
import BottomNavigationAction from "@mui/material/BottomNavigationAction";
import DashboardOutlined from "@mui/icons-material/DashboardOutlined";
import MenuBookOutlined from "@mui/icons-material/MenuBookOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import { ThemeModeMenu } from "./ThemeModeMenu";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: <DashboardOutlined /> },
  { href: "/guide", label: "Guide", icon: <MenuBookOutlined /> },
  { href: "/settings", label: "Settings", icon: <SettingsOutlined /> },
];

const RAIL = 88;

function RailItem({ href, label, icon, active }: (typeof NAV)[number] & { active: boolean }) {
  return (
    <ButtonBase
      component={Link}
      href={href}
      aria-current={active ? "page" : undefined}
      sx={{ flexDirection: "column", gap: 0.5, py: 1.5, width: "100%", borderRadius: 2 }}
    >
      <Box
        sx={{
          width: 56, height: 32, borderRadius: 9999, display: "grid", placeItems: "center",
          bgcolor: active ? "m3.secondaryContainer" : "transparent",
          color: active ? "text.primary" : "text.secondary",
        }}
      >
        {icon}
      </Box>
      <Typography variant="overline" sx={{ color: active ? "text.primary" : "text.secondary", fontWeight: active ? 700 : 500 }}>
        {label}
      </Typography>
    </ButtonBase>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const active = NAV.find((n) => path.startsWith(n.href))?.href ?? "/dashboard";
  return (
    <Box sx={{ display: "flex", minHeight: "100dvh", bgcolor: "background.default" }}>
      <Box
        component="nav"
        aria-label="Main"
        sx={{
          display: { xs: "none", sm: "flex" }, flexDirection: "column", alignItems: "center", gap: 1,
          width: RAIL, flexShrink: 0, pt: 10, px: 1.5, bgcolor: "m3.surfaceVariant",
          position: "sticky", top: 0, height: "100dvh",
        }}
      >
        {NAV.map((n) => <RailItem key={n.href} {...n} active={n.href === active} />)}
      </Box>
      <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <AppBar position="sticky" sx={{ borderBottom: 1, borderColor: "divider", bgcolor: "background.default" }}>
          <Toolbar sx={{ gap: 2 }}>
            <Typography variant="h6" component={Link} href="/dashboard" sx={{ color: "text.primary", textDecoration: "none", flexGrow: 1 }}>
              seo-jev-analyzer
            </Typography>
            <ThemeModeMenu />
          </Toolbar>
        </AppBar>
        <Box component="main" sx={{ flex: 1, p: { xs: 2, md: 3 }, pb: { xs: 10, sm: 3 }, maxWidth: 1280, width: "100%", mx: "auto" }}>
          {children}
        </Box>
      </Box>
      <BottomNavigation
        showLabels
        value={active}
        sx={{ display: { xs: "flex", sm: "none" }, position: "fixed", bottom: 0, left: 0, right: 0, borderTop: 1, borderColor: "divider" }}
      >
        {NAV.map((n) => (
          <BottomNavigationAction key={n.href} component={Link} href={n.href} value={n.href} label={n.label} icon={n.icon} />
        ))}
      </BottomNavigation>
    </Box>
  );
}

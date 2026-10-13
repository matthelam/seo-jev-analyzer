"use client";

// Material Design 3 values applied to an MUI theme.
// Colour roles generated with @material/material-color-utilities from seed #1A73E8.
// Type scale, corner radii and elevation follow the M3 system tokens.

import { createTheme } from "@mui/material/styles";

declare module "@mui/material/styles" {
  interface Palette {
    m3: M3Roles;
  }
  interface PaletteOptions {
    m3?: M3Roles;
  }
}

export type M3Roles = {
  primaryContainer: string;
  onPrimaryContainer: string;
  secondaryContainer: string;
  tertiary: string;
  tertiaryContainer: string;
  errorContainer: string;
  surfaceVariant: string;
  onSurfaceVariant: string;
  outline: string;
  outlineVariant: string;
};

const light = {
  primary: "#005BC0", onPrimary: "#FFFFFF", secondary: "#565E71", error: "#BA1A1A",
  surface: "#FEFBFF", onSurface: "#1B1B1F",
  m3: {
    primaryContainer: "#D8E2FF", onPrimaryContainer: "#001A41", secondaryContainer: "#DBE2F9",
    tertiary: "#715574", tertiaryContainer: "#FBD7FC", errorContainer: "#FFDAD6",
    surfaceVariant: "#E1E2EC", onSurfaceVariant: "#44474F", outline: "#74777F", outlineVariant: "#C4C6D0",
  },
};

const dark = {
  primary: "#ADC7FF", onPrimary: "#002E68", secondary: "#BFC6DC", error: "#FFB4AB",
  surface: "#1B1B1F", onSurface: "#E3E2E6",
  m3: {
    primaryContainer: "#004493", onPrimaryContainer: "#D8E2FF", secondaryContainer: "#3F4759",
    tertiary: "#DEBCDF", tertiaryContainer: "#583E5B", errorContainer: "#93000A",
    surfaceVariant: "#44474F", onSurfaceVariant: "#C4C6D0", outline: "#8E9099", outlineVariant: "#44474F",
  },
};

const palette = (s: typeof light) => ({
  primary: { main: s.primary, contrastText: s.onPrimary },
  secondary: { main: s.secondary },
  error: { main: s.error },
  background: { default: s.surface, paper: s.surface },
  text: { primary: s.onSurface, secondary: s.m3.onSurfaceVariant },
  divider: s.m3.outlineVariant,
  m3: s.m3,
});

const rem = (px: number) => `${px / 16}rem`;
const type = (size: number, line: number, weight = 400, tracking = 0) => ({
  fontSize: rem(size),
  lineHeight: `${line / size}`,
  fontWeight: weight,
  letterSpacing: `${tracking}px`,
});

export const theme = createTheme({
  cssVariables: { colorSchemeSelector: "class" },
  colorSchemes: { light: { palette: palette(light) }, dark: { palette: palette(dark) } },
  shape: { borderRadius: 12 },
  typography: {
    fontFamily: "Roboto, system-ui, -apple-system, \"Segoe UI\", sans-serif",
    h1: type(36, 44),           // display small
    h2: type(32, 40),           // headline large
    h3: type(28, 36),           // headline medium
    h4: type(24, 32),           // headline small
    h5: type(22, 28),           // title large
    h6: type(16, 24, 500, 0.15),// title medium
    subtitle1: type(16, 24, 500, 0.15),
    subtitle2: type(14, 20, 500, 0.1), // title small
    body1: type(16, 24, 400, 0.5),     // body large
    body2: type(14, 20, 400, 0.25),    // body medium
    button: { ...type(14, 20, 500, 0.1), textTransform: "none" }, // label large
    caption: type(12, 16, 400, 0.4),   // body small
    overline: { ...type(11, 16, 500, 0.5), textTransform: "none" }, // label small
  },
  components: {
    MuiButton: { styleOverrides: { root: { borderRadius: 9999, paddingInline: 24 } } },
    MuiChip: { styleOverrides: { root: { borderRadius: 8 } } },
    MuiCard: { defaultProps: { variant: "outlined" }, styleOverrides: { root: { borderRadius: 12 } } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiDialog: { styleOverrides: { paper: { borderRadius: 28 } } },
    MuiAppBar: { defaultProps: { elevation: 0, color: "inherit" } },
    MuiTableCell: { styleOverrides: { root: { fontVariantNumeric: "tabular-nums" } } },
  },
});

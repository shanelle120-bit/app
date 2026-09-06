// Design tokens for Level Up Trading Hub. Dark-first premium palette.
// Keys match the "color" block of /app/design_guidelines.json.
import { useMemo } from "react";
import { Appearance, StyleSheet, useColorScheme } from "react-native";

export type ColorScheme = "light" | "dark";

const dark = {
  surface: "#0B0F19",
  onSurface: "#FFFFFF",
  surfaceSecondary: "#131926",
  onSurfaceSecondary: "#F1F5F9",
  surfaceTertiary: "#1C2436",
  onSurfaceTertiary: "#FFFFFF",
  surfaceInverse: "#FFFFFF",
  onSurfaceInverse: "#0B0F19",
  muted: "#94A3B8",

  brand: "#8A2BE2",
  onBrand: "#FFFFFF",
  brandPrimary: "#9D4EDD",
  onBrandPrimary: "#FFFFFF",
  brandSecondary: "#00F0FF",
  onBrandSecondary: "#0B0F19",
  brandTertiary: "#2563EB",
  onBrandTertiary: "#FFFFFF",

  success: "#00E676",
  onSuccess: "#0B0F19",
  warning: "#FFC300",
  onWarning: "#0B0F19",
  error: "#FF2E63",
  onError: "#FFFFFF",
  info: "#00F0FF",
  onInfo: "#0B0F19",

  border: "#1E293B",
  borderStrong: "#334155",
  divider: "#1E293B",

  // extras
  silver: "#CBD5E1",
  overlay: "rgba(11,15,25,0.72)",
  glass: "rgba(19,25,38,0.82)",
  brandSoft: "rgba(157,78,221,0.18)",
  cyanSoft: "rgba(0,240,255,0.14)",
  blueSoft: "rgba(37,99,235,0.18)",
  errorSoft: "rgba(255,46,99,0.16)",
};

export type ThemeColors = typeof dark;

export const defaultScheme = "dark" satisfies ColorScheme;

// The app ships a single premium dark theme; both schemes resolve to it.
export const themes: { light: ThemeColors; dark?: ThemeColors } = { light: dark, dark };

export function setColorScheme(scheme: ColorScheme | null) {
  Appearance.setColorScheme?.((scheme ?? "unspecified") as any);
}

setColorScheme?.(defaultScheme);

export function useTheme(): { scheme: ColorScheme; colors: ThemeColors } {
  const system = useColorScheme();
  const scheme: ColorScheme = system === "light" || system === "dark" ? system : defaultScheme;
  return { scheme, colors: themes[scheme] ?? themes.light };
}

export function makeStyles<T extends StyleSheet.NamedStyles<T> | StyleSheet.NamedStyles<any>>(
  factory: (colors: ThemeColors) => T & StyleSheet.NamedStyles<any>,
): () => T {
  return function useStyles(): T {
    const { colors } = useTheme();
    return useMemo(() => StyleSheet.create(factory(colors)), [colors]);
  };
}

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, "2xl": 32, "3xl": 48 } as const;
export const radius = { sm: 6, md: 12, lg: 20, pill: 999 } as const;
export const fontSize = { sm: 12, base: 14, lg: 16, xl: 20, "2xl": 24, "3xl": 32 } as const;

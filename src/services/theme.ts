import { getSetting, setSetting, SETTINGS } from "./settings";

export const THEME_DEFAULTS = {
  bgPrimary: "#ffffff",
  bgSecondary: "#f7f7f8",
  bgSidebar: "#f0f0f2",
  textPrimary: "#1a1a1a",
  textSecondary: "#6b6b6b",
  border: "#e0e0e2",
  hover: "#f1f3f5",
  active: "#e5eaee",
  accent: "#1f5673",
} as const;

export interface ThemeSettings {
  bgPrimary: string;
  bgSecondary: string;
  bgSidebar: string;
  textPrimary: string;
  textSecondary: string;
  border: string;
  hover: string;
  active: string;
  accent: string;
}

const THEME_SETTING_KEYS = {
  bgPrimary: SETTINGS.THEME_BG_PRIMARY,
  bgSecondary: SETTINGS.THEME_BG_SECONDARY,
  bgSidebar: SETTINGS.THEME_BG_SIDEBAR,
  textPrimary: SETTINGS.THEME_TEXT_PRIMARY,
  textSecondary: SETTINGS.THEME_TEXT_SECONDARY,
  border: SETTINGS.THEME_BORDER,
  hover: SETTINGS.THEME_HOVER,
  active: SETTINGS.THEME_ACTIVE,
  accent: SETTINGS.THEME_ACCENT,
} satisfies Record<keyof ThemeSettings, string>;

const CSS_VARIABLES = {
  bgPrimary: "--bg-primary",
  bgSecondary: "--bg-secondary",
  bgSidebar: "--bg-sidebar",
  textPrimary: "--text-primary",
  textSecondary: "--text-secondary",
  border: "--border",
  hover: "--hover",
  active: "--active",
  accent: "--accent",
} satisfies Record<keyof ThemeSettings, string>;

function normalizeHex(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return normalized;
  return fallback;
}

export async function getThemeSettings(): Promise<ThemeSettings> {
  const theme: ThemeSettings = { ...THEME_DEFAULTS };

  for (const [key, settingKey] of Object.entries(THEME_SETTING_KEYS) as Array<
    [keyof ThemeSettings, string]
  >) {
    theme[key] = normalizeHex(await getSetting(settingKey), THEME_DEFAULTS[key]);
  }

  return theme;
}

export function applyThemeSettings(theme: ThemeSettings): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(theme)) {
    root.style.setProperty(
      CSS_VARIABLES[key as keyof ThemeSettings],
      value,
    );
  }
}

export async function updateThemeSetting(
  key: keyof ThemeSettings,
  value: string,
): Promise<string> {
  const normalized = normalizeHex(value, THEME_DEFAULTS[key]);
  await setSetting(THEME_SETTING_KEYS[key], normalized);
  const root = document.documentElement;
  root.style.setProperty(CSS_VARIABLES[key], normalized);
  window.dispatchEvent(new CustomEvent("theme-settings-updated"));
  return normalized;
}

export async function resetThemeSettings(): Promise<ThemeSettings> {
  for (const [key, settingKey] of Object.entries(THEME_SETTING_KEYS) as Array<
    [keyof ThemeSettings, string]
  >) {
    await setSetting(settingKey, THEME_DEFAULTS[key]);
  }

  const theme = { ...THEME_DEFAULTS };
  applyThemeSettings(theme);
  window.dispatchEvent(new CustomEvent("theme-settings-updated"));
  return theme;
}

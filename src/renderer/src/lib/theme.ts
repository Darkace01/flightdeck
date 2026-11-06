import { useEffect, useMemo, useState } from 'react'
import { findTheme, SYSTEM_FONT, type ThemeColors, type ThemePreset } from '../../../shared/themes'
import type { Settings } from '../../../shared/types'
import { useSettings } from './store'

export interface Appearance {
  mode: 'dark' | 'light'
  preset: ThemePreset
  colors: ThemeColors
  font: string
}

const CSS_VAR: Record<keyof ThemeColors, string> = {
  bg: '--bg',
  panel: '--panel',
  panel2: '--panel-2',
  hover: '--hover',
  border: '--border',
  text: '--text',
  dim: '--dim',
  accent: '--accent',
  ok: '--ok',
  bad: '--bad',
  warn: '--warn',
  run: '--run',
  muted: '--muted'
}

export function resolveAppearance(s: Settings, systemLight: boolean): Appearance {
  const mode = s.mode === 'system' ? (systemLight ? 'light' : 'dark') : s.mode
  const preset = findTheme(mode === 'dark' ? s.darkTheme : s.lightTheme, mode)
  const colors = { ...preset.colors, ...s.colorOverrides[mode] }
  const font =
    s.font === 'theme' ? (preset.font ?? SYSTEM_FONT) : s.font === 'system' ? SYSTEM_FONT : s.font === 'custom' ? `${s.customFont || 'system-ui'}, ${SYSTEM_FONT}` : s.font
  return { mode, preset, colors, font }
}

/** Black or white text, whichever reads better on the given colour. */
export function contrastText(hex: string): string {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#0d1117' : '#ffffff'
}

function useSystemLight(): boolean {
  const [light, setLight] = useState(() => window.matchMedia('(prefers-color-scheme: light)').matches)
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const on = () => setLight(media.matches)
    media.addEventListener('change', on)
    return () => media.removeEventListener('change', on)
  }, [])
  return light
}

export function useAppearance(): Appearance {
  const settings = useSettings()
  const light = useSystemLight()
  return useMemo(() => resolveAppearance(settings, light), [settings, light])
}

/** Pushes the resolved theme into CSS custom properties on <html>. */
export function useApplyAppearance(): void {
  const settings = useSettings()
  const a = useAppearance()
  useEffect(() => {
    const root = document.documentElement
    for (const [key, cssVar] of Object.entries(CSS_VAR)) root.style.setProperty(cssVar, a.colors[key as keyof ThemeColors])
    root.style.setProperty('--accent-fg', contrastText(a.colors.accent))
    root.style.setProperty('--font', a.font)
    root.style.setProperty('--font-size', `${settings.fontSize}px`)
    root.style.setProperty('--radius', `${a.preset.radius ?? 10}px`)
    root.style.colorScheme = a.mode
    root.dataset.mode = a.mode
    root.dataset.density = settings.density
    // The top bar leaves room for the macOS traffic lights on the left (see .topbar in styles.css).
    root.dataset.platform = navigator.userAgent.includes('Mac') ? 'mac' : 'other'
    if (a.preset.effect) root.dataset.effect = a.preset.effect
    else delete root.dataset.effect
  }, [a, settings.fontSize, settings.density])
}

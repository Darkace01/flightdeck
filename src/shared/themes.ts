// Theme presets. Each one is a full colour palette plus optional font / shape / effect tweaks.
// Users can pick one per mode (dark and light) and override any colour or the font on top.

export interface ThemeColors {
  bg: string
  panel: string
  panel2: string
  hover: string
  border: string
  text: string
  dim: string
  accent: string
  ok: string
  bad: string
  warn: string
  run: string
  muted: string
}

export const COLOR_LABELS: [keyof ThemeColors, string][] = [
  ['bg', 'Background'],
  ['panel', 'Panels'],
  ['panel2', 'Raised panels'],
  ['hover', 'Hover'],
  ['border', 'Borders'],
  ['text', 'Text'],
  ['dim', 'Secondary text'],
  ['accent', 'Accent'],
  ['ok', 'Success'],
  ['bad', 'Failure'],
  ['warn', 'Pending'],
  ['run', 'Running'],
  ['muted', 'Skipped / cancelled']
]

export interface ThemePreset {
  id: string
  name: string
  mode: 'dark' | 'light'
  colors: ThemeColors
  /** CSS font-family used when the user's font setting is "Theme default". */
  font?: string
  /** Corner radius in px for panels. */
  radius?: number
  effect?: 'glow' | 'crt'
}

export const MONO = "'Cascadia Code', 'JetBrains Mono', 'Fira Code', 'SF Mono', Menlo, Consolas, monospace"

export const THEMES: ThemePreset[] = [
  {
    id: 'github-dark',
    name: 'GitHub Dark',
    mode: 'dark',
    colors: { bg: '#0d1117', panel: '#161b22', panel2: '#1c2129', hover: '#21262d', border: '#30363d', text: '#e6edf3', dim: '#8d96a0', accent: '#58a6ff', ok: '#3fb950', bad: '#f85149', warn: '#d29922', run: '#d29922', muted: '#6e7681' }
  },
  {
    id: 'github-light',
    name: 'GitHub Light',
    mode: 'light',
    colors: { bg: '#f6f8fa', panel: '#ffffff', panel2: '#f6f8fa', hover: '#eef1f4', border: '#d0d7de', text: '#1f2328', dim: '#59636e', accent: '#0969da', ok: '#1a7f37', bad: '#cf222e', warn: '#9a6700', run: '#bf8700', muted: '#8c959f' }
  },
  {
    id: 'terminal',
    name: 'Terminal',
    mode: 'dark',
    font: MONO,
    radius: 0,
    effect: 'glow',
    colors: { bg: '#000000', panel: '#030a03', panel2: '#071207', hover: '#0c1f0c', border: '#145214', text: '#33ff66', dim: '#1fae45', accent: '#33ff66', ok: '#33ff66', bad: '#ff3b3b', warn: '#e5ff3b', run: '#e5ff3b', muted: '#1a7a33' }
  },
  {
    id: 'amber-crt',
    name: 'Amber CRT',
    mode: 'dark',
    font: MONO,
    radius: 0,
    effect: 'crt',
    colors: { bg: '#0b0700', panel: '#120c02', panel2: '#1a1204', hover: '#261a06', border: '#5c3d0a', text: '#ffb000', dim: '#c08000', accent: '#ffcc33', ok: '#ffd966', bad: '#ff5a1f', warn: '#ffb000', run: '#ffe08a', muted: '#7a5310' }
  },
  {
    id: 'atom-one-dark',
    name: 'Atom One Dark',
    mode: 'dark',
    colors: { bg: '#21252b', panel: '#282c34', panel2: '#2c313a', hover: '#333842', border: '#3e4451', text: '#abb2bf', dim: '#7f848e', accent: '#61afef', ok: '#98c379', bad: '#e06c75', warn: '#e5c07b', run: '#d19a66', muted: '#5c6370' }
  },
  {
    id: 'atom-one-light',
    name: 'Atom One Light',
    mode: 'light',
    colors: { bg: '#eaeaeb', panel: '#fafafa', panel2: '#f0f0f1', hover: '#e5e5e6', border: '#d4d4d6', text: '#383a42', dim: '#696c77', accent: '#4078f2', ok: '#50a14f', bad: '#e45649', warn: '#c18401', run: '#986801', muted: '#a0a1a7' }
  },
  {
    id: 'dracula',
    name: 'Dracula',
    mode: 'dark',
    colors: { bg: '#21222c', panel: '#282a36', panel2: '#2f3241', hover: '#373a4d', border: '#44475a', text: '#f8f8f2', dim: '#a0a6c8', accent: '#bd93f9', ok: '#50fa7b', bad: '#ff5555', warn: '#f1fa8c', run: '#ffb86c', muted: '#6272a4' }
  },
  {
    id: 'synthwave',
    name: "Synthwave '84",
    mode: 'dark',
    effect: 'glow',
    radius: 12,
    colors: { bg: '#1a1029', panel: '#241b2f', panel2: '#2a2139', hover: '#34294f', border: '#495495', text: '#f9f2ff', dim: '#b6a7d6', accent: '#ff7edb', ok: '#72f1b8', bad: '#fe4450', warn: '#fede5d', run: '#f97e72', muted: '#848bbd' }
  },
  {
    id: 'monokai',
    name: 'Monokai',
    mode: 'dark',
    colors: { bg: '#1e1f1c', panel: '#272822', panel2: '#2f302a', hover: '#3e3d32', border: '#49483e', text: '#f8f8f2', dim: '#a59f85', accent: '#66d9ef', ok: '#a6e22e', bad: '#f92672', warn: '#e6db74', run: '#fd971f', muted: '#75715e' }
  },
  {
    id: 'nord',
    name: 'Nord',
    mode: 'dark',
    colors: { bg: '#242933', panel: '#2e3440', panel2: '#3b4252', hover: '#434c5e', border: '#4c566a', text: '#eceff4', dim: '#a3acbd', accent: '#88c0d0', ok: '#a3be8c', bad: '#bf616a', warn: '#ebcb8b', run: '#d08770', muted: '#7b88a1' }
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    mode: 'dark',
    colors: { bg: '#16161e', panel: '#1a1b26', panel2: '#1f2335', hover: '#292e42', border: '#3b4261', text: '#c0caf5', dim: '#787c99', accent: '#7aa2f7', ok: '#9ece6a', bad: '#f7768e', warn: '#e0af68', run: '#ff9e64', muted: '#565f89' }
  },
  {
    id: 'catppuccin-mocha',
    name: 'Catppuccin Mocha',
    mode: 'dark',
    radius: 14,
    colors: { bg: '#11111b', panel: '#1e1e2e', panel2: '#232334', hover: '#313244', border: '#45475a', text: '#cdd6f4', dim: '#a6adc8', accent: '#cba6f7', ok: '#a6e3a1', bad: '#f38ba8', warn: '#f9e2af', run: '#fab387', muted: '#7f849c' }
  },
  {
    id: 'catppuccin-latte',
    name: 'Catppuccin Latte',
    mode: 'light',
    radius: 14,
    colors: { bg: '#dce0e8', panel: '#eff1f5', panel2: '#e6e9ef', hover: '#dfe3ea', border: '#bcc0cc', text: '#4c4f69', dim: '#6c6f85', accent: '#8839ef', ok: '#40a02b', bad: '#d20f39', warn: '#df8e1d', run: '#fe640b', muted: '#9ca0b0' }
  },
  {
    id: 'gruvbox-dark',
    name: 'Gruvbox Dark',
    mode: 'dark',
    colors: { bg: '#1d2021', panel: '#282828', panel2: '#32302f', hover: '#3c3836', border: '#504945', text: '#ebdbb2', dim: '#a89984', accent: '#fabd2f', ok: '#b8bb26', bad: '#fb4934', warn: '#fabd2f', run: '#fe8019', muted: '#7c6f64' }
  },
  {
    id: 'solarized-dark',
    name: 'Solarized Dark',
    mode: 'dark',
    colors: { bg: '#00212b', panel: '#002b36', panel2: '#073642', hover: '#0a4250', border: '#174652', text: '#eee8d5', dim: '#93a1a1', accent: '#268bd2', ok: '#859900', bad: '#dc322f', warn: '#b58900', run: '#cb4b16', muted: '#657b83' }
  },
  {
    id: 'solarized-light',
    name: 'Solarized Light',
    mode: 'light',
    colors: { bg: '#eee8d5', panel: '#fdf6e3', panel2: '#f5efdc', hover: '#ebe4cf', border: '#d6cfb8', text: '#073642', dim: '#586e75', accent: '#268bd2', ok: '#859900', bad: '#dc322f', warn: '#b58900', run: '#cb4b16', muted: '#93a1a1' }
  },
  {
    id: 'rose-pine-dawn',
    name: 'Rosé Pine Dawn',
    mode: 'light',
    radius: 14,
    colors: { bg: '#f2e9e1', panel: '#fffaf3', panel2: '#faf4ed', hover: '#f4ede8', border: '#dfdad9', text: '#575279', dim: '#797593', accent: '#d7827e', ok: '#56949f', bad: '#b4637a', warn: '#ea9d34', run: '#d7827e', muted: '#9893a5' }
  },
  {
    id: 'paper',
    name: 'Paper',
    mode: 'light',
    font: "Georgia, 'Iowan Old Style', 'Palatino Linotype', serif",
    radius: 2,
    colors: { bg: '#f4f1ea', panel: '#fbfaf6', panel2: '#f4f1ea', hover: '#eeeae0', border: '#d8d2c4', text: '#2b2a27', dim: '#6f6b62', accent: '#b03a2e', ok: '#2e7d32', bad: '#b03a2e', warn: '#a66a00', run: '#a66a00', muted: '#9a958a' }
  }
]

export const DEFAULT_DARK = 'github-dark'
export const DEFAULT_LIGHT = 'github-light'

export function findTheme(id: string, mode: 'dark' | 'light'): ThemePreset {
  return THEMES.find((t) => t.id === id) ?? THEMES.find((t) => t.id === (mode === 'dark' ? DEFAULT_DARK : DEFAULT_LIGHT))!
}

export const FONT_CHOICES: [string, string][] = [
  ['theme', 'Theme default'],
  ['system', 'System UI'],
  ["'Segoe UI Variable', 'Segoe UI', sans-serif", 'Segoe UI'],
  ["Inter, 'Helvetica Neue', Arial, sans-serif", 'Inter / Helvetica'],
  ["'Cascadia Code', monospace", 'Cascadia Code'],
  ["'JetBrains Mono', monospace", 'JetBrains Mono'],
  ["'Fira Code', monospace", 'Fira Code'],
  ['Consolas, monospace', 'Consolas'],
  ["'Courier New', monospace", 'Courier New'],
  ["Georgia, serif", 'Georgia'],
  ["'Comic Sans MS', 'Comic Neue', cursive", 'Comic Sans (why not)'],
  ['custom', 'Custom…']
]

export const SYSTEM_FONT = "'Segoe UI Variable', 'Segoe UI', -apple-system, BlinkMacSystemFont, Inter, system-ui, sans-serif"

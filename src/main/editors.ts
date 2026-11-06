import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { EditorOption } from '../shared/types'

// Editors and IDEs we know how to open a folder in: [id, name, command-line launcher, macOS app name].
const KNOWN: [string, string, string, string][] = [
  ['vscode', 'Visual Studio Code', 'code', 'Visual Studio Code'],
  ['vscode-insiders', 'VS Code Insiders', 'code-insiders', 'Visual Studio Code - Insiders'],
  ['cursor', 'Cursor', 'cursor', 'Cursor'],
  ['windsurf', 'Windsurf', 'windsurf', 'Windsurf'],
  ['zed', 'Zed', 'zed', 'Zed'],
  ['sublime', 'Sublime Text', 'subl', 'Sublime Text'],
  ['idea', 'IntelliJ IDEA', 'idea', 'IntelliJ IDEA'],
  ['webstorm', 'WebStorm', 'webstorm', 'WebStorm'],
  ['rider', 'Rider', 'rider', 'Rider'],
  ['pycharm', 'PyCharm', 'pycharm', 'PyCharm'],
  ['goland', 'GoLand', 'goland', 'GoLand'],
  ['fleet', 'Fleet', 'fleet', 'Fleet']
]

function run(file: string, args: string[]): Promise<string | undefined> {
  return new Promise((resolve) => execFile(file, args, { timeout: 5000, windowsHide: true }, (err, out) => resolve(err ? undefined : out.trim())))
}

const onPath = (cmd: string) => run(process.platform === 'win32' ? 'where.exe' : 'which', [cmd]).then(Boolean)

/** Visual Studio has no launcher on PATH; vswhere (shipped with its installer) knows where devenv.exe is. */
async function visualStudio(): Promise<EditorOption | undefined> {
  const vswhere = join(process.env['ProgramFiles(x86)'] ?? 'C:\Program Files (x86)', 'Microsoft Visual Studio', 'Installer', 'vswhere.exe')
  if (!existsSync(vswhere)) return undefined
  const devenv = (await run(vswhere, ['-latest', '-property', 'productPath']))?.split('\n')[0]?.trim()
  return devenv && existsSync(devenv) ? { id: 'visualstudio', name: 'Visual Studio', command: `"${devenv}"` } : undefined
}

let cached: Promise<EditorOption[]> | undefined

/** The known editors installed on this machine, in KNOWN order. Detected once per launch. */
export function listEditors(): Promise<EditorOption[]> {
  cached ??= (async () => {
    const found = await Promise.all(
      KNOWN.map(async ([id, name, cmd, macApp]): Promise<EditorOption | undefined> => {
        if (await onPath(cmd)) return { id, name, command: cmd }
        // On macOS most editors don't install their shell launcher by default, but `open -a` works.
        if (process.platform === 'darwin' && ['/Applications', join(process.env.HOME ?? '', 'Applications')].some((d) => existsSync(join(d, `${macApp}.app`))))
          return { id, name, command: `open -a "${macApp}"` }
        return undefined
      })
    )
    if (process.platform === 'win32') found.push(await visualStudio())
    return found.filter((e): e is EditorOption => !!e)
  })()
  return cached
}

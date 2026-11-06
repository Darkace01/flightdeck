import { useEffect, useState } from 'react'
import { resolveEditor } from '../../../shared/defaults'
import type { EditorOption } from '../../../shared/types'
import { api } from './store'

let editors: Promise<EditorOption[]> | undefined

/** Editors installed on this machine (detected once by the main process), or undefined while detecting. */
export function useEditors(): EditorOption[] | undefined {
  const [list, setList] = useState<EditorOption[]>()
  useEffect(() => {
    editors ??= api.listEditors()
    editors.then(setList, () => setList([]))
  }, [])
  return list
}

/** A friendly name for the configured editor command: "Cursor" rather than "cursor". */
export function editorName(command: string, list: EditorOption[] | undefined): string {
  const cmd = resolveEditor(command, list)
  return list?.find((e) => e.command === cmd)?.name ?? cmd
}

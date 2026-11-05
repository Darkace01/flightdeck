import type { RepoDeckApi } from '../../shared/types'

declare global {
  interface Window {
    repodeck: RepoDeckApi
  }
}

declare module '*.css'

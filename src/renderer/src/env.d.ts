import type { PushbackApi } from '../../shared/types'

declare global {
  interface Window {
    pushback: PushbackApi
  }
}

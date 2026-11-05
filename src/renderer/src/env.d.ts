import type { FlightdeckApi } from '../../shared/types'

declare global {
  interface Window {
    flightdeck: FlightdeckApi
  }
}

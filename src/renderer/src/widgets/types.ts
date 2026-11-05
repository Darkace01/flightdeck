import type { WidgetConfig } from '../../../shared/types'

export interface WidgetProps {
  widget: WidgetConfig
  /** Free-text filter typed into the widget header. */
  filter: string
}

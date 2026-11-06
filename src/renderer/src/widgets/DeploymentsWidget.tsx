import { memo } from 'react'
import { DeploymentsView, type DeployView } from '../components/Deployments'
import { matches } from '../lib/format'
import { useSettings, widgetRepos } from '../lib/store'
import type { WidgetProps } from './types'

/** Octopus-style deployment board for the widget's repos; its view (environments, clients, history) is an option. */
export const DeploymentsWidget = memo(function DeploymentsWidget({ widget, filter }: WidgetProps) {
  const settings = useSettings()
  const repos = widgetRepos(widget.repos, settings.repos).filter((r) => !filter || matches(r, filter))
  return <DeploymentsView repos={repos} view={(widget.options.view as DeployView) ?? 'environments'} compact />
})

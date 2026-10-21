import { useOutletContext } from 'react-router-dom'
import type { Project } from '@/lib/types'

export interface ProjectCtx {
  project: Project
  /** URL prefix for this project, e.g. "/alice/rover-chassis-v2". */
  base: string
  freshIds: Set<string>
  isOwner: boolean
}

export function useProjectCtx() {
  return useOutletContext<ProjectCtx>()
}

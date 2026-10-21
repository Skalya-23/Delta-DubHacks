// Shared data formats. Field names are the contract with the Jetson team; do not change them.

/** Normalized 0..1 bounding box, (x, y) is the top-left corner. */
export interface Box {
  x: number
  y: number
  w: number
  h: number
}

/** One detected thing on the bench. */
export interface BenchObject extends Box {
  id: string
  name: string
}

export type ChangeType = 'moved' | 'added' | 'removed'

/** One entry in a commit's diff. `from` is null for added, `to` is null for removed. */
export interface Change {
  type: ChangeType
  name: string
  from: Box | null
  to: Box | null
  detail: string
}

export type ProcessingState = 'pending' | 'described' | 'failed'
export type CommitStatus = 'untested' | 'working' | 'broken'
export type FrameKind = 'before' | 'after' | 'sequence'
export type MemberRole = 'owner' | 'member'

export interface Profile {
  id: string
  username: string
  display_name: string | null
  created_at: string
}

export interface Project {
  id: string
  owner_id: string
  name: string
  slug: string
  description: string | null
  readme: string | null
  live_stream_url: string | null
  active_user_id: string | null
  created_at: string
}

export interface ProjectMember {
  project_id: string
  user_id: string
  role: MemberRole
}

export interface Commit {
  id: string
  project_id: string
  seq: number
  author_id: string | null
  title: string | null
  mk1_summary: string | null
  objects_before: BenchObject[]
  objects_after: BenchObject[]
  changes: Change[]
  processing_state: ProcessingState
  status: CommitStatus
  is_hidden: boolean
  user_description: string | null
  captured_at: string
  created_at: string
}

export interface Frame {
  id: string
  commit_id: string
  project_id: string
  kind: FrameKind
  frame_index: number
  storage_path: string
  width: number | null
  height: number | null
  captured_at: string
}

export interface CommitNote {
  id: string
  commit_id: string
  project_id: string
  author_id: string
  body: string
  created_at: string
}

export interface Checkpoint {
  id: string
  project_id: string
  commit_id: string
  name: string
  description: string | null
  photo_path: string | null
  created_by: string | null
  created_at: string
}

export interface ProjectDoc {
  id: string
  project_id: string
  title: string
  body: string | null
  updated_by: string | null
  updated_at: string
  created_at: string
}

export interface ProjectInvite {
  id: string
  project_id: string
  token: string
  created_by: string | null
  created_at: string
  expires_at: string
  revoked: boolean
}

/** A request for the Jetson to record. 'requested' → 'recording' → 'stop_requested' → 'stopped'. */
export type CaptureStatus = 'requested' | 'recording' | 'stop_requested' | 'stopped'

export type SummaryState = 'pending' | 'ready' | 'failed'

export interface CaptureSession {
  id: string
  project_id: string
  status: CaptureStatus
  started_by: string | null
  created_at: string
  stopped_at?: string | null
  change_count?: number | null
  summary?: string | null
  summary_state?: SummaryState | null
}

export type QuestionState = 'pending' | 'answered' | 'failed'

export interface ProjectQuestion {
  id: string
  project_id: string
  asked_by: string | null
  question: string
  answer: string | null
  state: QuestionState
  created_at: string
  answered_at: string | null
}

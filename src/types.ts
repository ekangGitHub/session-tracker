export type SessionType = 'Green' | 'Yellow' | 'Red';
export type EnergyAfter = 'Better' | 'Same' | 'Worse';
export type SessionOrigin = 'mentor' | 'self_study';

export interface SessionRow {
  id: string;
  session_date: string;
  session_type: SessionType;
  planned_minutes: number;
  actual_minutes: number;
  energy_after: EnergyAfter;
  notes: string | null;
  created_at: string;
  user_id: string;
  mentee_id: string | null;
  mentor_id: string | null;
  session_origin: SessionOrigin;
}

export interface TaskRow {
  id: string;
  session_id: string;
  task_name: string;
  sort_order: number | null;
  planned_minutes: number | null;
  completed: boolean;
  created_at: string;
  user_id: string;
}

export interface SessionWithTasks extends SessionRow {
  tasks: TaskRow[];
}

export interface MentorshipRow {
  id: string;
  mentor_id: string;
  mentee_id: string;
  created_at: string;
}

export type MentorshipInvitationStatus = 'pending' | 'accepted' | 'declined';

export interface MentorshipInvitationRow {
  id: string;
  mentor_id: string;
  mentor_email: string;
  mentee_email: string;
  status: MentorshipInvitationStatus;
  responded_by: string | null;
  created_at: string;
  responded_at: string | null;
}

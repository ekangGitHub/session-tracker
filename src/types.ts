export type SessionType = 'Green' | 'Yellow' | 'Red';
export type EnergyAfter = 'Better' | 'Same' | 'Worse';

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

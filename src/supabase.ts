import { createClient } from '@supabase/supabase-js';
import type { SessionWithTasks, SessionRow, TaskRow } from './types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Missing environment variable: VITE_SUPABASE_URL. Please ensure it is set in your .env file.'
  );
}

if (!supabaseAnonKey) {
  throw new Error(
    'Missing environment variable: VITE_SUPABASE_ANON_KEY. Please ensure it is set in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function fetchSessionsWithTasks(): Promise<SessionWithTasks[]> {
  try {
    // Fetch all sessions ordered by session_date desc, then created_at desc
    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select('*')
      .order('session_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (sessionsError) {
      throw new Error(`Failed to fetch sessions: ${sessionsError.message}`);
    }

    if (!sessions || sessions.length === 0) {
      return [];
    }

    // Fetch tasks for each session
    const sessionsWithTasks: SessionWithTasks[] = [];

    for (const session of sessions) {
      const { data: tasks, error: tasksError } = await supabase
        .from('session_tasks')
        .select('*')
        .eq('session_id', session.id)
        .order('sort_order', { ascending: true });

      if (tasksError) {
        throw new Error(
          `Failed to fetch tasks for session ${session.id}: ${tasksError.message}`
        );
      }

      sessionsWithTasks.push({
        ...(session as SessionRow),
        tasks: (tasks as TaskRow[]) || [],
      });
    }

    return sessionsWithTasks;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`fetchSessionsWithTasks failed: ${message}`);
  }
}

export async function createSessionWithTasks(
  sessionData: Omit<SessionRow, 'id' | 'created_at'>,
  tasks: Omit<TaskRow, 'id' | 'session_id' | 'created_at'>[]
): Promise<SessionWithTasks> {
  try {
    // Insert session row
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .insert([sessionData])
      .select('*')
      .single();

    if (sessionError) {
      throw new Error(`Failed to create session: ${sessionError.message}`);
    }

    if (!session) {
      throw new Error('Session creation returned no data');
    }

    // Insert related tasks
    const tasksToInsert = tasks.map((task) => ({
      ...task,
      session_id: session.id,
    }));

    let insertedTasks: TaskRow[] = [];

    if (tasksToInsert.length > 0) {
      const { data: insertedTasksData, error: tasksError } = await supabase
        .from('session_tasks')
        .insert(tasksToInsert)
        .select('*');

      if (tasksError) {
        throw new Error(`Failed to create tasks: ${tasksError.message}`);
      }

      insertedTasks = (insertedTasksData as TaskRow[]) || [];
    }

    return {
      ...(session as SessionRow),
      tasks: insertedTasks,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`createSessionWithTasks failed: ${message}`);
  }
}

export async function updateTaskCompleted(
  taskId: string,
  completed: boolean
): Promise<TaskRow> {
  try {
    const { data: task, error } = await supabase
      .from('session_tasks')
      .update({ completed })
      .eq('id', taskId)
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to update task: ${error.message}`);
    }

    if (!task) {
      throw new Error('Task update returned no data');
    }

    return task as TaskRow;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`updateTaskCompleted failed: ${message}`);
  }
}

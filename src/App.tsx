import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import { supabase, fetchSessionsWithTasks, createSessionWithTasks } from './supabase'

type SessionType = 'Green' | 'Yellow' | 'Red'
type EnergyAfter = 'Better' | 'Same' | 'Worse'

interface SessionEntry {
  id: string
  date: string
  sessionType: SessionType
  plannedMinutes: number
  actualMinutes: number
  tasksCompleted: number | null
  energyAfter: EnergyAfter
  notes: string
}

// Create helper functions:
// loadSessions(): SessionEntry[]  -> load from Supabase
// saveSessions(entries: SessionEntry[]): void -> save to Supabase
// Must handle missing/invalid data safely (return empty array if bad)

async function loadSessions(): Promise<SessionEntry[]> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return []

    const sessionsWithTasks = await fetchSessionsWithTasks()
    return sessionsWithTasks.map((s) => ({
      id: s.id,
      date: s.session_date,
      sessionType: s.session_type,
      plannedMinutes: s.planned_minutes,
      actualMinutes: s.actual_minutes,
      tasksCompleted: null,
      energyAfter: s.energy_after,
      notes: s.notes || '',
    }))
  } catch (e) {
    console.error('Failed to load sessions from Supabase', e)
    return []
  }
}

async function saveSessions(entry: SessionEntry): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) throw new Error('Not authenticated')

    await createSessionWithTasks(
      {
        session_date: entry.date,
        session_type: entry.sessionType,
        planned_minutes: entry.plannedMinutes,
        actual_minutes: entry.actualMinutes,
        energy_after: entry.energyAfter,
        notes: entry.notes || null,
        user_id: session.user.id,
      },
      []
    )
  } catch (e) {
    console.error('Failed to save session to Supabase', e)
    throw e
  }
}


function App() {
  const defaultPlannedFor = (t: SessionType) => (t === 'Green' ? 90 : t === 'Yellow' ? 45 : 15)

  const [sessions, setSessions] = useState<SessionEntry[]>([])
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const today = () => new Date().toISOString().slice(0, 10)

  const initialForm: SessionEntry = {
    id: '',
    date: today(),
    sessionType: 'Green',
    plannedMinutes: defaultPlannedFor('Green'),
    actualMinutes: 0,
    tasksCompleted: null,
    energyAfter: 'Same',
    notes: '',
  }

  const [form, setForm] = useState<SessionEntry>(initialForm)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check auth status and load sessions
    const initializeApp = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setIsAuthenticated(!!session)
        if (session) {
          const loaded = await loadSessions()
          setSessions(loaded)
        }
      } catch (e) {
        console.error('Failed to initialize app', e)
      } finally {
        setIsLoading(false)
      }
    }

    initializeApp()

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, session: any) => {
      setIsAuthenticated(!!session)
      if (session) {
        const reload = async () => {
          const loaded = await loadSessions()
          setSessions(loaded)
        }
        reload()
      } else {
        setSessions([])
      }
    })

    return () => subscription?.unsubscribe()
  }, [])

  const setField = (k: keyof SessionEntry, v: any) => {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target as HTMLInputElement
    if (name === 'plannedMinutes' || name === 'actualMinutes' || name === 'tasksCompleted') {
      const num = value === '' ? NaN : Number(value)
      if (name === 'tasksCompleted') {
        setField('tasksCompleted', value === '' ? null : num)
      } else {
        setField(name as keyof SessionEntry, num)
      }
    } else if (name === 'notes' || name === 'date') {
      setField(name as keyof SessionEntry, value)
    }
  }

  const handleSessionTypeChange = (value: SessionType) => {
    setField('sessionType', value)
    setField('plannedMinutes', defaultPlannedFor(value))
  }

  const handleEnergyChange = (value: EnergyAfter) => setField('energyAfter', value)

  const handleSave = async () => {
    setError(null)
    if (!form.sessionType) return setError('Session type is required')
    if (!form.energyAfter) return setError('Energy after is required')
    if (form.actualMinutes === null || form.actualMinutes === undefined || isNaN(form.actualMinutes))
      return setError('Actual minutes is required')

    try {
      await saveSessions(form)
      const loaded = await loadSessions()
      setSessions(loaded)
      setForm({ ...initialForm, date: today() })
    } catch (e) {
      setError((e as Error).message || 'Failed to save session')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await supabase.from('sessions').delete().eq('id', id)
      const loaded = await loadSessions()
      setSessions(loaded)
    } catch (e) {
      console.error('Failed to delete session', e)
    }
  }

  return (
    <>
      <div>
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Session Tracker</h1>

      {isLoading ? (
        <p>Loading...</p>
      ) : !isAuthenticated ? (
        <p>Please sign in to use the Session Tracker.</p>
      ) : (
        <>
          <section className="card">
            <h2>New Session</h2>
            {error && <div style={{ color: 'red' }}>{error}</div>}

            <div>
              <label>
                Date
                <input type="date" name="date" value={form.date} onChange={handleInputChange} />
              </label>
            </div>

            <fieldset>
              <legend>Session Type</legend>
              <label>
                <input type="radio" name="sessionType" checked={form.sessionType === 'Green'} onChange={() => handleSessionTypeChange('Green')} />
                Green
              </label>
              <label>
                <input type="radio" name="sessionType" checked={form.sessionType === 'Yellow'} onChange={() => handleSessionTypeChange('Yellow')} />
                Yellow
              </label>
              <label>
                <input type="radio" name="sessionType" checked={form.sessionType === 'Red'} onChange={() => handleSessionTypeChange('Red')} />
                Red
              </label>
            </fieldset>

            <div>
              <label>
                Planned Minutes
                <input type="number" name="plannedMinutes" value={String(form.plannedMinutes)} onChange={handleInputChange} />
              </label>
            </div>

            <div>
              <label>
                Actual Minutes*
                <input type="number" name="actualMinutes" value={String(form.actualMinutes)} onChange={handleInputChange} />
              </label>
            </div>

            <div>
              <label>
                Tasks Completed (optional)
                <input type="number" name="tasksCompleted" value={form.tasksCompleted === null ? '' : String(form.tasksCompleted)} onChange={handleInputChange} />
              </label>
            </div>

            <fieldset>
              <legend>Energy After*</legend>
              <label>
                <input type="radio" name="energyAfter" checked={form.energyAfter === 'Better'} onChange={() => handleEnergyChange('Better')} />
                Better
              </label>
              <label>
                <input type="radio" name="energyAfter" checked={form.energyAfter === 'Same'} onChange={() => handleEnergyChange('Same')} />
                Same
              </label>
              <label>
                <input type="radio" name="energyAfter" checked={form.energyAfter === 'Worse'} onChange={() => handleEnergyChange('Worse')} />
                Worse
              </label>
            </fieldset>

            <div>
              <label>
                Notes
                <textarea name="notes" value={form.notes} onChange={handleInputChange} />
              </label>
            </div>

            <div>
              <button onClick={handleSave}>Save</button>
            </div>
          </section>

          <section>
            <h2>Entries ({sessions.length})</h2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Date</th>
                  <th style={{ textAlign: 'left' }}>Type</th>
                  <th style={{ textAlign: 'right' }}>Planned</th>
                  <th style={{ textAlign: 'right' }}>Actual</th>
                  <th style={{ textAlign: 'right' }}>Tasks</th>
                  <th style={{ textAlign: 'left' }}>Energy</th>
                  <th style={{ textAlign: 'left' }}>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {[...sessions]
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((s) => (
                    <tr key={s.id} style={{ borderTop: '1px solid #eee' }}>
                      <td>{s.date}</td>
                      <td>{s.sessionType}</td>
                      <td style={{ textAlign: 'right' }}>{s.plannedMinutes}</td>
                      <td style={{ textAlign: 'right' }}>{s.actualMinutes}</td>
                      <td style={{ textAlign: 'right' }}>{s.tasksCompleted ?? '-'}</td>
                      <td>{s.energyAfter}</td>
                      <td>{s.notes || '-'}</td>
                      <td>
                        <button onClick={() => handleDelete(s.id)} style={{ color: 'red' }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </>
  )
}

export default App

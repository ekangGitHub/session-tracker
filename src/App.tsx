import { useState, useEffect } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import {
  supabase,
  fetchSessionsWithTasks,
  createSessionWithTasks,
  fetchMentorshipInvitations,
  fetchMentorships,
  respondToMentorshipInvitation,
  sendMentorshipInvitation,
  updateSession,
} from './supabase'
import type { MentorshipInvitationRow, MentorshipRow, SessionOrigin } from './types'

type SessionType = 'Green' | 'Yellow' | 'Red'
type EnergyAfter = 'Better' | 'Same' | 'Worse'

interface SessionEntry {
  id: string
  userId: string
  menteeId: string | null
  mentorId: string | null
  sessionOrigin: SessionOrigin
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
      userId: s.user_id,
      menteeId: s.mentee_id,
      mentorId: s.mentor_id,
      sessionOrigin: s.session_origin,
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
        mentee_id: entry.menteeId,
        mentor_id: entry.mentorId,
        session_origin: entry.sessionOrigin,
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

  const today = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const initialForm: SessionEntry = {
    id: '',
    userId: '',
    menteeId: null,
    mentorId: null,
    sessionOrigin: 'mentor',
    date: today(),
    sessionType: 'Green',
    plannedMinutes: defaultPlannedFor('Green'),
    actualMinutes: 0,
    tasksCompleted: null,
    energyAfter: 'Same',
    notes: '',
  }

  const [form, setForm] = useState<SessionEntry>(initialForm)
  const [currentUserId, setCurrentUserId] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [mentorships, setMentorships] = useState<MentorshipRow[]>([])
  const [invitations, setInvitations] = useState<MentorshipInvitationRow[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [sharingError, setSharingError] = useState<string | null>(null)
  const [isSharing, setIsSharing] = useState(false)

  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Check auth status and load sessions
    const initializeApp = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        setIsAuthenticated(!!session)
        setCurrentUserId(session?.user.id ?? '')
        if (session) {
          const [loaded, loadedMentorships, loadedInvitations] = await Promise.all([
            loadSessions(),
            fetchMentorships(),
            fetchMentorshipInvitations(),
          ])
          setSessions(loaded)
          setMentorships(loadedMentorships)
          setInvitations(loadedInvitations)
        }
      } catch (e) {
        console.error('Failed to initialize app', e)
      } finally {
        setIsLoading(false)
      }
    }

    initializeApp()

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session)
      setCurrentUserId(session?.user.id ?? '')
      if (session) {
        const reload = async () => {
          const [loaded, loadedMentorships, loadedInvitations] = await Promise.all([
            loadSessions(),
            fetchMentorships(),
            fetchMentorshipInvitations(),
          ])
          setSessions(loaded)
          setMentorships(loadedMentorships)
          setInvitations(loadedInvitations)
        }
        reload()
      } else {
        setSessions([])
        setMentorships([])
        setInvitations([])
      }
    })

    return () => subscription?.unsubscribe()
  }, [])

  const setField = <K extends keyof SessionEntry>(k: K, v: SessionEntry[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }))
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target as HTMLInputElement
    if (name === 'plannedMinutes' || name === 'actualMinutes' || name === 'tasksCompleted') {
      const num = value === '' ? NaN : Number(value)
      if (name === 'tasksCompleted') {
        setField('tasksCompleted', value === '' ? null : num)
      } else {
        setField(name as 'plannedMinutes' | 'actualMinutes', num)
      }
    } else if (name === 'notes' || name === 'date') {
      setField(name, value)
    }
  }

  const handleSessionTypeChange = (value: SessionType) => {
    setField('sessionType', value)
    setField('plannedMinutes', defaultPlannedFor(value))
  }

  const handleEnergyChange = (value: EnergyAfter) => setField('energyAfter', value)

  const handleSessionOriginChange = (value: SessionOrigin) => {
    setField('sessionOrigin', value)
    setField('menteeId', value === 'self_study' ? currentUserId : null)
    setField('mentorId', value === 'mentor' ? currentUserId : null)
  }

  const handleSave = async () => {
    setError(null)
    const hasMentorRole = mentorships.some(
      (relationship) => relationship.mentor_id === currentUserId
    )
    const hasMenteeRole = mentorships.some(
      (relationship) => relationship.mentee_id === currentUserId
    )
    const sessionOrigin =
      !form.id && !hasMentorRole && hasMenteeRole ? 'self_study' : form.sessionOrigin
    const menteeId =
      !form.id && sessionOrigin === 'self_study' ? currentUserId : form.menteeId
    const mentorId =
      !form.id && sessionOrigin === 'mentor' ? currentUserId : form.mentorId

    if (!form.date) return setError('Date is required')
    if (!form.sessionType) return setError('Session type is required')
    if (!form.energyAfter) return setError('Energy after is required')
    if (!menteeId) return setError('Select a mentee for this session')
    if (!mentorId) return setError('Select a mentor for this session')
    if (!form.id && sessionOrigin === 'self_study' && menteeId !== currentUserId)
      return setError('A self-study session must be created for your own account')
    if (!Number.isFinite(form.plannedMinutes) || form.plannedMinutes < 0)
      return setError('Planned minutes must be zero or greater')
    if (form.actualMinutes === null || form.actualMinutes === undefined || isNaN(form.actualMinutes))
      return setError('Actual minutes is required')
    if (form.actualMinutes < 0) return setError('Actual minutes must be zero or greater')

    setIsSaving(true)
    try {
      if (form.id) {
        await updateSession(form.id, {
          session_date: form.date,
          session_type: form.sessionType,
          planned_minutes: form.plannedMinutes,
          actual_minutes: form.actualMinutes,
          energy_after: form.energyAfter,
          notes: form.notes || null,
          mentee_id: menteeId,
          mentor_id: mentorId,
          session_origin: sessionOrigin,
        })
      } else {
        await saveSessions({
          ...form,
          menteeId,
          mentorId,
          sessionOrigin,
        })
      }
      const loaded = await loadSessions()
      setSessions(loaded)
      setForm({ ...initialForm, date: today() })
    } catch (e) {
      setError((e as Error).message || 'Failed to save session')
    } finally {
      setIsSaving(false)
    }
  }

  const handleEdit = (session: SessionEntry) => {
    setError(null)
    setForm({ ...session })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleCancelEdit = () => {
    setError(null)
    setForm({ ...initialForm, date: today() })
  }

  const handleDelete = async (id: string) => {
    try {
      setError(null)
      const { error: deleteError } = await supabase.from('sessions').delete().eq('id', id)
      if (deleteError) throw new Error(`Failed to delete session: ${deleteError.message}`)
      const loaded = await loadSessions()
      setSessions(loaded)
    } catch (e) {
      console.error('Failed to delete session', e)
      setError((e as Error).message || 'Failed to delete session')
    }
  }

  const reloadSharing = async () => {
    const [loadedMentorships, loadedInvitations, loadedSessions] = await Promise.all([
      fetchMentorships(),
      fetchMentorshipInvitations(),
      loadSessions(),
    ])
    setMentorships(loadedMentorships)
    setInvitations(loadedInvitations)
    setSessions(loadedSessions)
  }

  const handleInvite = async () => {
    setSharingError(null)
    const normalizedEmail = inviteEmail.trim().toLowerCase()
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setSharingError('Enter a valid mentee email address')
      return
    }

    setIsSharing(true)
    try {
      await sendMentorshipInvitation(currentUserId, normalizedEmail)
      setInviteEmail('')
      await reloadSharing()
    } catch (e) {
      setSharingError((e as Error).message || 'Failed to send invitation')
    } finally {
      setIsSharing(false)
    }
  }

  const handleInvitationResponse = async (invitationId: string, accept: boolean) => {
    setSharingError(null)
    setIsSharing(true)
    try {
      await respondToMentorshipInvitation(invitationId, accept)
      await reloadSharing()
    } catch (e) {
      setSharingError((e as Error).message || 'Failed to respond to invitation')
    } finally {
      setIsSharing(false)
    }
  }

  const mentees = mentorships.filter((relationship) => relationship.mentor_id === currentUserId)
  const mentors = mentorships.filter((relationship) => relationship.mentee_id === currentUserId)
  const isMentee = mentorships.some(
    (relationship) => relationship.mentee_id === currentUserId
  )
  const displayedSessionOrigin =
    !form.id && mentees.length === 0 && isMentee ? 'self_study' : form.sessionOrigin
  const incomingInvitations = invitations.filter(
    (invitation) => invitation.mentor_id !== currentUserId && invitation.status === 'pending'
  )
  const outgoingInvitations = invitations.filter(
    (invitation) => invitation.mentor_id === currentUserId
  )
  const menteeLabel = (relationship: MentorshipRow) => {
    const acceptedInvitation = invitations.find(
      (invitation) =>
        invitation.mentor_id === currentUserId
        && invitation.responded_by === relationship.mentee_id
        && invitation.status === 'accepted'
    )

    return acceptedInvitation?.mentee_email
      ?? `Mentee ${relationship.mentee_id.slice(0, 8)}`
  }
  const mentorLabel = (relationship: MentorshipRow) => {
    const acceptedInvitation = invitations.find(
      (invitation) =>
        invitation.mentor_id === relationship.mentor_id
        && invitation.responded_by === currentUserId
        && invitation.status === 'accepted'
    )

    return acceptedInvitation?.mentor_email
      ?? `Mentor ${relationship.mentor_id.slice(0, 8)}`
  }
  const canManageSession = (session: SessionEntry) =>
    session.userId === currentUserId
    || (
      session.sessionOrigin === 'self_study'
      && session.mentorId === currentUserId
      && mentorships.some(
        (relationship) =>
          relationship.mentor_id === currentUserId
          && relationship.mentee_id === session.menteeId
        )
    )
  const mentorMenteeIds = new Set(mentees.map((relationship) => relationship.mentee_id))
  const sessionsInMenteeGroups = sessions.filter(
    (session) => session.menteeId && mentorMenteeIds.has(session.menteeId)
  )
  const sessionsForCurrentMentee = sessions.filter(
    (session) =>
      session.menteeId === currentUserId
      && session.mentorId !== null
      && mentors.some((relationship) => relationship.mentor_id === session.mentorId)
  )
  const groupedSessionIds = new Set([
    ...sessionsInMenteeGroups.map((session) => session.id),
    ...sessionsForCurrentMentee.map((session) => session.id),
  ])
  const ungroupedSessions = sessions.filter(
    (session) => !groupedSessionIds.has(session.id)
  )
  const renderSessionsTable = (entries: SessionEntry[]) => {
    if (entries.length === 0) return <p>No session records yet.</p>

    return (
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Date</th>
            <th style={{ textAlign: 'left' }}>Origin</th>
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
          {[...entries]
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((session) => (
              <tr key={session.id} style={{ borderTop: '1px solid #eee' }}>
                <td>{session.date}</td>
                <td>
                  {session.sessionOrigin === 'self_study' ? 'Self-study' : 'Mentor-led'}
                </td>
                <td>{session.sessionType}</td>
                <td style={{ textAlign: 'right' }}>{session.plannedMinutes}</td>
                <td style={{ textAlign: 'right' }}>{session.actualMinutes}</td>
                <td style={{ textAlign: 'right' }}>{session.tasksCompleted ?? '-'}</td>
                <td>{session.energyAfter}</td>
                <td>{session.notes || '-'}</td>
                <td>
                  {canManageSession(session) && (
                    <>
                      <button onClick={() => handleEdit(session)}>
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(session.id)}
                        style={{ color: 'red' }}
                      >
                        Delete
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    )
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
            <h2>Mentor Connections</h2>
            {sharingError && <div style={{ color: 'red' }}>{sharingError}</div>}

            <div>
              <label>
                Invite a mentee by email
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(event) => setInviteEmail(event.target.value)}
                />
              </label>
              <button onClick={handleInvite} disabled={isSharing}>
                Send invitation
              </button>
            </div>

            {incomingInvitations.length > 0 && (
              <div>
                <h3>Invitations for you</h3>
                {incomingInvitations.map((invitation) => (
                  <div key={invitation.id}>
                    <span>Mentor: {invitation.mentor_email}</span>
                    <button
                      onClick={() => handleInvitationResponse(invitation.id, true)}
                      disabled={isSharing}
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleInvitationResponse(invitation.id, false)}
                      disabled={isSharing}
                    >
                      Decline
                    </button>
                  </div>
                ))}
              </div>
            )}

            {outgoingInvitations.length > 0 && (
              <div>
                <h3>Invitations sent</h3>
                <ul>
                  {outgoingInvitations.map((invitation) => (
                    <li key={invitation.id}>
                      {invitation.mentee_email}: {invitation.status}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {(mentees.length > 0 || isMentee) && (
          <section className="card">
            <h2>
              {form.id
                ? `Edit ${form.sessionOrigin === 'self_study' ? 'Self-Study' : 'Mentor-Led'} Session`
                : 'New Session'}
            </h2>
            {error && <div style={{ color: 'red' }}>{error}</div>}

            <fieldset>
              <legend>Session Origin</legend>
              {mentees.length > 0 && (
                <label>
                  <input
                    type="radio"
                    name="sessionOrigin"
                    checked={displayedSessionOrigin === 'mentor'}
                    disabled={Boolean(form.id)}
                    onChange={() => handleSessionOriginChange('mentor')}
                  />
                  Mentor-led
                </label>
              )}
              {(isMentee || (form.id && form.sessionOrigin === 'self_study')) && (
                <label>
                  <input
                    type="radio"
                    name="sessionOrigin"
                    checked={displayedSessionOrigin === 'self_study'}
                    disabled={Boolean(form.id)}
                    onChange={() => handleSessionOriginChange('self_study')}
                  />
                  Self-study
                </label>
              )}
            </fieldset>

            {displayedSessionOrigin === 'mentor' ? (
              <div>
                <label>
                  Mentee
                  <select
                    value={form.menteeId ?? ''}
                    onChange={(event) => setField('menteeId', event.target.value || null)}
                  >
                    <option value="">Select a mentee</option>
                    {mentees.map((relationship) => (
                      <option key={relationship.id} value={relationship.mentee_id}>
                        {menteeLabel(relationship)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : (
              <div>
                <p>
                  {form.id && form.userId !== currentUserId
                    ? 'Editing a self-study session for your paired mentee.'
                    : 'Logging a self-study session for your own account.'}
                </p>
                <label>
                  Mentor
                  <select
                    value={form.mentorId ?? ''}
                    disabled={Boolean(form.id && form.userId !== currentUserId)}
                    onChange={(event) => setField('mentorId', event.target.value || null)}
                  >
                    <option value="">Select a mentor</option>
                    {mentors.map((relationship) => (
                      <option key={relationship.id} value={relationship.mentor_id}>
                        {mentorLabel(relationship)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            )}

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
              <button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : form.id ? 'Update' : 'Save'}
              </button>
              {form.id && (
                <button onClick={handleCancelEdit} disabled={isSaving}>
                  Cancel
                </button>
              )}
            </div>
          </section>
          )}

          {(mentees.length > 0 || mentors.length > 0) ? (
            <section>
              <h2>Session Records ({sessions.length})</h2>
              {mentees.length > 0 && (
                <>
                  <h3>My Mentees</h3>
                  {mentees.map((relationship) => {
                    const menteeSessions = sessions.filter(
                      (session) => session.menteeId === relationship.mentee_id
                    )

                    return (
                      <section className="card" key={relationship.id}>
                        <h4>{menteeLabel(relationship)}</h4>
                        <p>{menteeSessions.length} session record(s)</p>
                        {renderSessionsTable(menteeSessions)}
                      </section>
                    )
                  })}
                </>
              )}

              {mentors.length > 0 && (
                <>
                  <h3>My Mentors</h3>
                  {mentors.map((relationship) => {
                    const mentorSessions = sessionsForCurrentMentee.filter(
                      (session) => session.mentorId === relationship.mentor_id
                    )

                    return (
                      <section className="card" key={relationship.id}>
                        <h4>{mentorLabel(relationship)}</h4>
                        <p>{mentorSessions.length} session record(s)</p>
                        {renderSessionsTable(mentorSessions)}
                      </section>
                    )
                  })}
                </>
              )}

              {ungroupedSessions.length > 0 && (
                <section className="card">
                  <h3>Other Session Records</h3>
                  <p>{ungroupedSessions.length} session record(s)</p>
                  {renderSessionsTable(ungroupedSessions)}
                </section>
              )}
            </section>
          ) : (
            <section>
              <h2>Session Records ({sessions.length})</h2>
              {renderSessionsTable(sessions)}
            </section>
          )}
        </>
      )}
    </>
  )
}

export default App

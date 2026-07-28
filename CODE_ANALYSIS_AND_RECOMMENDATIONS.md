# Session Tracker: Code Analysis and Recommendations

Analysis date: July 25, 2026

This document records the initial repository review and the recommended next
steps so they can be evaluated later. It also notes which findings have already
been addressed by the subsequent mentor/mentee sharing work.

## Current architecture

The project is a small React 19 and TypeScript client built with Vite and backed
directly by Supabase.

- `src/main.tsx` mounts the application and wraps it with authentication.
- `src/Auth.tsx` manages Google OAuth, session state, and sign-out.
- `src/App.tsx` contains the session form, session table, and most UI state.
- `src/supabase.ts` contains Supabase persistence operations.
- `src/types.ts` defines the database-facing session and task types.
- `supabase/migrations` contains version-controlled database changes added after
  the initial review.

The application currently models sessions and optional related session tasks.
Authentication is handled entirely in the browser with a Supabase anonymous
client key, so database Row Level Security is the primary security boundary.
Mentor-led records are managed by their creating mentor and read by the assigned
mentee. Self-study records are created and managed by the mentee, with exactly
one selected paired mentor also receiving management access.

## Findings

### 1. The "Tasks Completed" field is not persisted

Priority: High

The form collects a numeric `tasksCompleted` value, but session creation passes
an empty task list and does not write that number to the database. Loading a
session explicitly sets the value back to `null`. As a result, the value entered
by a user disappears after saving.

Choose one clear domain model:

1. Add a `tasks_completed` integer column to `sessions`; or
2. Let users create individual `session_tasks` records and calculate the count
   from tasks whose `completed` value is true.

The second option is more flexible and fits the existing database types, but it
requires a task-entry UI. The first option is simpler if only an aggregate count
is needed.

Status: Not addressed.

### 2. Database access depends on correct RLS policies

Priority: Critical

Session queries do not add a browser-side `user_id` filter. This can be a sound
design when Row Level Security is enabled and correctly configured, but it means
RLS must be treated as part of the application rather than external setup.

The mentor/mentee work added an in-app invitation migration that:

- Creates many-to-many mentorship pairings after a mentee accepts.
- Keeps sessions owned and editable by their mentor.
- Gives the assigned mentee read-only session access.
- Prevents browser clients from changing session ownership.
- Aligns task access with access to the parent session.

Before production deployment, inspect the live Supabase database for older
policies. PostgreSQL permissive policies are combined with `OR`, so an older,
broader policy can still grant more access than the new policies intend.

Status: Partially addressed. The migration exists locally but still needs to be
applied and audited against the live database.

### 3. Task loading uses an N+1 query pattern

Priority: Medium

The application first loads all sessions, then performs one sequential
`session_tasks` request for each session. Loading 100 sessions therefore
requires 101 API requests even though the UI currently does not use the fetched
task records.

Recommended change:

- If tasks remain unused, stop fetching them.
- If tasks are added to the UI, use a Supabase relational select to fetch
  sessions and their tasks in one request.
- Add pagination before the session history grows significantly.

Status: Not addressed.

### 4. Authentication state is maintained twice

Priority: Medium

`Auth.tsx` prevents the application from rendering until authentication is
resolved. `App.tsx` then independently calls `getSession`, maintains another
authentication/loading state, and subscribes to the same auth events.

Recommended change:

- Create a single authentication context/provider.
- Expose the current `Session`, user ID, loading state, and sign-out action
  through that provider.
- Let `App.tsx` consume the session rather than querying Supabase auth again.

This will remove redundant subscriptions, requests, and loading transitions.

Status: Not addressed.

### 5. Multi-step session/task creation is not atomic

Priority: Medium when task creation is enabled

`createSessionWithTasks` inserts the session and its tasks in separate API
requests. If session creation succeeds but task insertion fails, a partial
session remains.

Recommended change:

- Implement session-plus-task creation as a PostgreSQL function and invoke it
  with `supabase.rpc`.
- Perform both inserts in one database transaction.
- Validate that the task `user_id` matches the parent session owner.

Status: Not addressed.

### 6. Validation and request-state handling are incomplete

Priority: Medium

The mentor/mentee work added date and non-negative duration validation and
disables the save button while a request is active. Additional safeguards are
still useful:

- Require integer values where fractional minutes or task counts are invalid.
- Give number inputs suitable `min` and `step` attributes.
- Add a delete confirmation or an undo mechanism.
- Disable per-row actions while deletion is pending.
- Provide an accessible status message after save, update, or delete.
- Consider reasonable maximum lengths for notes and durations.

Status: Partially addressed.

### 7. Error handling should be consistently user-visible

Priority: Medium

Supabase normally returns failures through a result's `error` property rather
than rejecting its promise. The original delete implementation ignored that
property; this has been corrected. Authentication sign-out and some background
reload failures can still be presented more clearly.

Recommended change:

- Centralize translation of Supabase errors into user-facing messages.
- Inspect the returned error for every database and authentication operation.
- Distinguish access-denied, connectivity, and validation failures.
- Use logging/monitoring in production rather than relying only on
  `console.error`.

Status: Partially addressed.

### 8. Ownership is visible only as "Mine" or "Mentee"

Priority: Medium for mentors with multiple mentees

The shared-session UI can distinguish the current user's records from shared
mentee records, but it does not show the mentee's name. A mentor with several
mentees will not know who owns a row.

Recommended change:

- Add a `profiles` table keyed by `auth.users.id`.
- Store a display name and, if appropriate, a role.
- Join session ownership to profiles when loading shared records.
- Apply RLS so users only see profiles needed for their mentorship
  relationships.

Do not query `auth.users` directly from the browser or expose private
authentication metadata.

Status: Not addressed.

#### TODO: Display mentor and mentee names

- Add a protected `profiles` table keyed by `auth.users.id`.
- Store `first_name` and `last_name` separately.
- Create a profile automatically when a user first signs in, or require profile
  completion before invitations and session creation.
- Show the person's full name in:
  - Mentor selection dropdowns.
  - Mentee selection dropdowns.
  - **My Mentors** and **My Mentees** session-record headings.
  - Invitation and connection lists.
- Use email as a fallback when a name has not been provided.
- Use a shortened UUID only as the final fallback for legacy data.
- Do not copy names into every session row; resolve the display name through the
  user profile so later name corrections appear consistently.
- Add RLS policies that allow users to edit their own profile and allow connected
  mentors/mentees to read only the profile fields required for display.
- Add tests proving unrelated users cannot browse profile information.

Suggested display priority:

```text
First name + last name
    ↓ if missing
Email
    ↓ if missing
Short user UUID
```

Status: Planned for later.

### 9. The UI is still based on the Vite starter

Priority: Low to Medium

The application still displays React/Vite logos and uses starter CSS. The
session table may overflow on smaller screens and most layout styling is inline.

Recommended change:

- Remove starter logos and animation.
- Create a focused session dashboard layout.
- Make the history responsive, possibly using cards on narrow screens.
- Move inline styles into reusable CSS classes or components.
- Verify keyboard focus, table semantics, labels, error announcements, and
  color contrast.

Status: Not addressed.

### 9a. Move mentor connections to a separate page

Priority: Medium

The invitation form, connection lists, session form, and complete session
history currently share one page. This will become difficult to navigate when a
user has several mentors or mentees.

Recommended navigation:

```text
Dashboard
├── Sessions
└── Connections
    ├── Invitations
    └── Existing relationships
```

The **Connections** page should support both perspectives:

- When the signed-in user is acting as a mentor:
  - Show pending invitations sent by the mentor.
  - Show all existing mentees.
  - Provide a link beside each mentee that opens the session history filtered
    to that mentor/mentee relationship.
- When the signed-in user is acting as a mentee:
  - Show pending invitations received by the mentee.
  - Show all existing mentors.
  - Provide a link beside each mentor that opens the session history filtered
    to that mentor/mentee relationship.
- When a user has both roles, show separate **My Mentees** and **My Mentors**
  sections rather than forcing the account into one role.

Suggested routes:

```text
/connections
/sessions
/sessions?mentee=<mentee-user-id>
/sessions?mentor=<mentor-user-id>
```

Opaque user UUIDs should not be the primary labels. Add a protected `profiles`
table with display names and expose email only where it is appropriate for an
existing invitation or relationship.

The filtered session page must not rely on URL parameters for authorization.
The URL should only select which already-authorized records to display; RLS must
continue to enforce access in PostgreSQL.

For mentor-led sessions, filtering by relationship means:

- The mentor sees sessions they created for that mentee.
- The mentee sees sessions created for them by that mentor.

For self-study sessions:

- The mentee sees their own self-study records.
- A paired mentor sees the mentee's self-study records within that relationship
  view.

Status: Planned for later.

### 10. Testing and schema documentation are limited

Priority: High before production use

There are no automated tests for the session flows or access-control behavior.
The database schema that predates the mentorship migration is also absent from
the repository.

Recommended minimum coverage:

- Unit tests for form validation and data mapping.
- Component tests for create, edit, cancel, delete, and error states.
- Integration tests for session persistence.
- Database/RLS tests proving:
  - A user can access their own sessions.
  - A mentor can access a paired mentee's sessions.
  - A mentee cannot access the mentor's personal sessions.
  - Unpaired users cannot access one another's sessions.
  - Browser clients cannot create mentorships or transfer ownership.
- Version-controlled migrations for the original `sessions` and
  `session_tasks` tables.

Status: Not addressed.

### 11. Deployment configuration is repository-specific

Priority: Low

Vite's base path is fixed to `/session-tracker/`, which is appropriate for the
current GitHub Pages-style location but makes deployment elsewhere less
portable.

Recommended change:

- Configure the base path from an environment variable, or use `/` when
  deploying at a domain root.
- Document the required Supabase OAuth redirect URLs for development and
  production.

Status: Not addressed.

### 12. Dependency health should be reviewed

Priority: Medium

Installing the locked dependencies during the mentor/mentee change reported 11
audit findings: 1 low, 1 moderate, and 9 high. This document does not recommend
blindly running `npm audit fix`, since major or transitive upgrades can introduce
breaking changes.

Recommended change:

1. Run `npm audit` and identify whether findings affect production dependencies,
   development tooling, or both.
2. Upgrade direct dependencies deliberately.
3. Re-run lint, build, and application tests after each meaningful upgrade.

Status: Not addressed.

## Recommended implementation order

1. Apply and audit the mentorship/RLS migration in a non-production Supabase
   environment.
2. Add RLS integration tests and version-control the complete original schema.
3. Decide whether tasks are aggregate counts or individual records, then fix the
   disappearing Tasks Completed value.
4. Add user profiles so mentors can identify multiple mentees.
5. Consolidate authentication state into one provider.
6. Remove the N+1 task queries and introduce pagination.
7. Make session/task creation transactional if individual tasks are retained.
8. Complete validation, error states, and destructive-action safeguards.
9. Add component and integration tests.
10. Replace the starter interface and improve responsive/accessibility behavior.
11. Audit and update dependencies.
12. Make deployment configuration portable and document OAuth setup.

## Future behavior-therapy session tracking

Decision: Build behavior-therapy tracking as a separate application with a
separate Supabase project and database. Reuse non-domain-specific code from this
repository where practical.

### Why it should be separate

The two applications have different concepts and security boundaries:

- This application models mentor invitations, mentor/mentee relationships, and
  mentor-owned sessions that an assigned mentee can read.
- A behavior-therapy application would model clients, clinical staff
  assignments, and records that several assigned RBTs may create and edit.
- Behavior-therapy records may contain protected health information and require
  stronger access controls, auditing, retention practices, and operational
  safeguards.

Keeping the databases separate reduces the risk of accidentally exposing
clinical information through a policy or feature intended for the general
session tracker. It also allows backups, logging, secrets, compliance settings,
and deployments to be managed independently.

Do not repurpose `mentorships` to represent RBT/client assignments. Although
both are many-to-many relationships, their business rules and permissions are
different.

### Suggested repository structure

The applications can share reusable code without sharing their data:

```text
Shared packages
├── Authentication UI
├── Form controls
├── Date and validation utilities
└── Design system

Session Tracker
├── Mentor/mentee workflow
└── Session Tracker Supabase project

Behavior Therapy Tracker
├── Client/staff workflow
├── Clinical record and revision history
└── Separate HIPAA-configured Supabase project
```

A monorepo is optional. Separate repositories are also reasonable if the two
applications will have different teams or release schedules.

### Suggested behavior-therapy data model

Start with domain-specific tables rather than adapting the existing session
schema:

- `organizations`
- `staff_profiles`
- `clients`
- `client_staff_assignments`
  - `client_id`
  - `staff_id`
  - role such as RBT, BCBA, or supervisor
  - assignment start and end dates
- `therapy_sessions`
  - `client_id`
  - `created_by`
  - session date and clinical fields
- `therapy_session_revisions` or `audit_events`
  - actor
  - timestamp
  - operation
  - previous and new values

Row Level Security should grant access through an active staff assignment.
Assigned RBTs may create and update the relevant client's records; unassigned
staff should receive no access. Supervisors and administrators should have
explicit, independently testable policies.

Clinical edits should retain an audit trail instead of permanently replacing
history without attribution. Important questions to resolve during product
design include record finalization, amendments after finalization, supervisor
sign-off, assignment expiration, data export, and retention.

### Privacy and compliance boundary

If identifiable behavior-therapy data is electronic protected health
information and the organization is subject to HIPAA, technical implementation
alone is insufficient. The organization should obtain appropriate compliance
and legal guidance, complete a risk assessment, establish operational policies,
and execute required Business Associate Agreements.

Supabase states that customers using it for protected health information must
sign a BAA and configure their HIPAA projects according to its shared
responsibility guidance. The application should also provide strong
authentication, least-privilege access, audit controls, integrity protections,
secure transmission, and procedures for terminating staff access.

References:

- [Supabase HIPAA compliance guidance](https://supabase.com/docs/guides/security/hipaa-compliance)
- [HHS Security Rule summary](https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html)
- [HHS minimum necessary guidance](https://www.hhs.gov/hipaa/for-professionals/privacy/guidance/minimum-necessary-requirement/index.html)

## Verification snapshot

After the mentor/mentee sharing implementation:

- `npm run lint` passed.
- `npm run build` passed.
- `git diff --check` passed.

The database migration was created in the repository but was not applied to a
Supabase project during this review.

### Resolved Supabase test finding

During manual testing on July 28, 2026, a mentee was unexpectedly able to update
a mentor-led session. The tested row had the correct ownership:

- `session_origin`: `mentor`
- `user_id` and `mentor_id`: the mentor account
- `mentee_id`: the mentee account

This rules out incorrect row ownership. Inspection of `pg_policies` found no
policy that should authorize that mentee update. The likely cause is that the
Supabase SQL Editor update ran with dashboard-owner privileges instead of the
intended simulated `authenticated` identity. Dashboard-owner queries bypass RLS.

The test was repeated with `current_user = authenticated` and `auth.uid()` equal
to the mentee. An `UPDATE ... RETURNING` wrapped in a counting CTE reported
`rows_updated = 0`, confirming that the mentee cannot update the mentor-led
record. The transaction included `rollback` in the same SQL execution, so no
test mutation persisted.

The mentee delete-denial test also reported zero affected rows, and an unrelated
authenticated user reported zero visible rows for the tested session. The core
mentor-led session RLS boundary is therefore verified through SQL role
impersonation.

The application was also tested with separate browser sessions for a mentor and
a mentee, plus an account acting in both roles. This verifies the mentor-only,
mentee-only, and dual-role UI paths with real Supabase authentication sessions.

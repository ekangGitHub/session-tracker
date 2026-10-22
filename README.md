# Session Tracker

A React and Supabase application for recording work sessions. Mentors invite
mentees in the app and assign one accepted mentee to each session. Mentors own
and edit their session records; the assigned mentee has read-only access.

Mentees can also create self-study sessions and select exactly one paired mentor
for each record. The mentee owns and manages the record, and the selected mentor
may view, edit, or delete it.

## Local development

Steven's current tasks and acceptance criteria are in
[STEVEN_REQUIREMENTS.md](STEVEN_REQUIREMENTS.md).

Create a `.env.local` file containing:

```dotenv
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

Then run:

```sh
npm install
npm run dev
```

## Database setup

Apply the SQL files in `supabase/migrations` to the Supabase project. With the
Supabase CLI linked to the project, run:

```sh
supabase db push
```

The migration:

- Creates pending in-app invitations.
- Creates many-to-many mentor/mentee relationships after acceptance.
- Adds a nullable `mentee_id` to existing sessions without deleting data.
- Adds a `session_origin` value (`mentor` or `self_study`); existing rows default
  to `mentor`.
- Adds `mentor_id`. Mentor-led rows use their creator; each self-study row uses
  the mentor selected by the mentee.
- Adds Row Level Security policies for mentor-owned, mentee-readable sessions.

It assumes the existing `sessions` and `session_tasks` tables have the columns
represented in `src/types.ts`.

## Invitation flow

1. The mentor signs in and enters the mentee's sign-in email.
2. The mentee signs in with that exact email.
3. The mentee accepts or declines the pending invitation.
4. Acceptance creates the relationship.
5. The mentor selects that mentee when creating or editing a session.

Invitations are in-app only. No email is sent.

## Preserve and assign existing sessions

The migration keeps all existing session rows and adds `mentee_id` as `null`.
After the first mentee accepts the invitation, find the mentor and mentee UUIDs
under **Authentication → Users** in the Supabase dashboard.

First preview the rows that will be assigned:

```sql
select id, session_date, notes
from public.sessions
where user_id = '<mentor-user-id>'
  and mentee_id is null;
```

If all returned rows belong to the first mentee, assign them:

```sql
update public.sessions
set mentee_id = '<first-mentee-user-id>'
where user_id = '<mentor-user-id>'
  and mentee_id is null;
```

This updates only the new relationship column. Session IDs and all existing
session data remain unchanged.

If self-study sessions were created before `mentor_id` was introduced, assign
one paired mentor to each:

```sql
update public.sessions
set mentor_id = '<selected-mentor-user-id>'
where id = '<self-study-session-id>'
  and session_origin = 'self_study'
  and mentor_id is null;
```

To remove a pairing administratively:

```sql
delete from public.mentorships
where mentor_id = '<mentor-user-id>'
  and mentee_id = '<mentee-user-id>';
```

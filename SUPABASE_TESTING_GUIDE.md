# Supabase Testing Guide

This guide tests the in-app invitation workflow, the existing-session migration,
and the mentor/mentee permissions against a Supabase project.

## Safety rules

- Back up existing session data before applying the migration.
- Replace every value surrounded by angle brackets before running example SQL.
- Preview existing rows before assigning them to the first mentee.
- Use transactions and `rollback` for permission tests.
- Do not run `supabase db reset --linked` against this project. That command
  deletes the linked remote database before rebuilding it.

## 1. Back up existing data

In the Supabase dashboard:

1. Open **Table Editor → sessions**.
2. Export the table as CSV.
3. Export `session_tasks` as CSV if it contains data.
4. Store the exports somewhere outside the project directory.

If these tables do not appear in Table Editor, use **SQL Editor** instead:

```sql
select * from public.sessions order by session_date;
```

Run the query and use the result grid's CSV download action. Repeat for tasks:

```sql
select * from public.session_tasks order by session_id, sort_order;
```

Free Supabase projects may not provide restorable daily backups. Supabase
recommends regularly creating logical exports for free-tier projects.

Reference:
[Supabase database backups](https://supabase.com/docs/guides/platform/backups)

## 2. Apply the migration

In the Supabase dashboard:

1. Open **SQL Editor**.
2. Select **New query**.
3. Copy the complete contents of
   `supabase/migrations/202607250001_add_mentorships_and_shared_session_access.sql`.
4. Paste the SQL into the editor.
5. Select **Run**.

The migration is additive. It creates invitation and relationship tables and
adds a nullable `mentee_id` column to `sessions`. It does not delete or recreate
existing session rows.

### Verify the new tables

Run:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('mentorships', 'mentorship_invitations')
order by table_name;
```

Expected result:

```text
mentorship_invitations
mentorships
```

### Verify the new session column

Run:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'sessions'
  and column_name in ('mentee_id', 'mentor_id', 'session_origin')
order by column_name;
```

Expected result:

- `column_name`: `mentee_id`
- `data_type`: `uuid`
- `is_nullable`: `YES`
- `mentor_id` exists. Mentor-led rows contain their creator's UUID.
- `session_origin` also exists and existing rows contain `mentor`.

### Verify Data API privileges

Run:

```sql
select table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee = 'authenticated'
  and table_name in (
    'sessions',
    'session_tasks',
    'mentorships',
    'mentorship_invitations'
  )
order by table_name, privilege_type;
```

Expected permissions:

- `sessions`: `SELECT`, `INSERT`, `UPDATE`, and `DELETE`
- `session_tasks`: `SELECT`, `INSERT`, `UPDATE`, and `DELETE`
- `mentorships`: `SELECT`
- `mentorship_invitations`: `SELECT` and `INSERT`

These table-level privileges allow the Data API to reach the tables. Row Level
Security independently determines which rows a signed-in user may access.

The `authenticated` role must not have `TRUNCATE`, `TRIGGER`, or `REFERENCES`.
In particular, PostgreSQL does not apply RLS policies to `TRUNCATE`.

## 3. Configure local Google OAuth

In Supabase:

1. Open **Authentication → URL Configuration**.
2. Add this redirect URL:

```text
http://localhost:5173/session-tracker/
```

3. Keep the existing production redirect URL.

Start the application from the project directory:

```sh
npm run dev
```

Open the URL reported by Vite. With the current base-path configuration, it will
normally be:

```text
http://localhost:5173/session-tracker/
```

## 4. Test an invitation

Use two distinct Google accounts:

- A normal browser window for the mentor.
- A private/incognito browser window for the mentee.

Perform the following test:

1. Sign in as the mentor.
2. Enter the mentee's exact Google account email.
3. Send the invitation.
4. Sign in as the mentee in the private window.
5. Confirm that the invitation appears.
6. Confirm that the invitation identifies the mentor by email, not by UUID.
7. Accept the invitation.
8. Return to the mentor window and refresh.
9. Confirm that the mentee is available in the session form.

Verify the relationship in the SQL Editor:

```sql
select id, mentor_id, mentee_id, created_at
from public.mentorships
order by created_at;
```

There should be a row containing the two test users.

## 5. Assign existing sessions to the first mentee

Find the mentor and mentee UUIDs under **Authentication → Users**.

### Preview the affected rows

Replace `<mentor-user-id>` and run:

```sql
select id, session_date, notes, user_id, mentee_id
from public.sessions
where user_id = '<mentor-user-id>'
  and mentee_id is null
order by session_date;
```

Review every returned row. Continue only if all of them belong to the first
mentee.

### Assign the rows

Replace both UUID placeholders and run:

```sql
update public.sessions
set mentee_id = '<mentee-user-id>'
where user_id = '<mentor-user-id>'
  and mentee_id is null;
```

This only fills the new relationship column. It does not change session IDs,
dates, durations, energy values, notes, or ownership.

### Verify the result

```sql
select id, session_date, notes, user_id, mentee_id
from public.sessions
where user_id = '<mentor-user-id>'
order by session_date desc;
```

Confirm that the existing rows now contain the first mentee's UUID.

### Assign a mentor to existing self-study test rows

Self-study sessions created before the selected-mentor feature have a null
`mentor_id`. Find them:

```sql
select id, session_date, notes, user_id, mentee_id, mentor_id
from public.sessions
where session_origin = 'self_study'
  and mentor_id is null;
```

For each row, choose exactly one mentor who is paired with that mentee:

```sql
update public.sessions
set mentor_id = '<selected-mentor-user-id>'
where id = '<self-study-session-id>'
  and session_origin = 'self_study'
  and mentor_id is null;
```

The validation trigger rejects a mentor who is not currently paired with the
mentee.

## 6. Test through the application

### Mentor checks

As the mentor:

- Existing sessions appear.
- Each owned session says **Editable**.
- Edit and Delete buttons appear.
- A new session can be assigned to the mentee.
- The new session can be saved and edited.

### Mentee checks

As the mentee:

- Sessions assigned to the mentee appear.
- Each shared session says **Read only**.
- Edit and Delete buttons do not appear.
- Sessions assigned to a different mentee do not appear.
- The mentee can create a **Self-study** session.
- Creating a self-study session requires selecting exactly one paired mentor.
- The mentee can edit and delete their own self-study session.

### Mentor checks for self-study

After the mentee creates a self-study session, return to the selected mentor:

- The self-study session appears.
- It is marked **Self-study** and **Editable**.
- The mentor can update it.
- The mentor can delete it.
- Another paired mentor who was not selected cannot see it.

The interface checks are useful, but hiding buttons is not sufficient security.
The following section verifies that the database rejects mentee writes.

## 7. Test Row Level Security

Run this test in the SQL Editor. Replace the UUID, email, and session ID
placeholders first.

Select and run the entire block—including `rollback`—with one click. Supabase
SQL Editor may use a different database connection for a later Run, so a
separately executed `rollback` might not reverse the test update.

```sql
begin;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"<mentee-user-id>","email":"<mentee-email>","role":"authenticated"}';

-- Verify read access.
select id, session_date, notes, user_id, mentee_id
from public.sessions
order by session_date;

-- Verify update denial using a mentor-led session.
update public.sessions
set notes = 'THIS SHOULD NOT BE SAVED'
where id = '<assigned-mentor-led-session-id>'
returning id;

-- Verify delete denial using the same mentor-led session.
delete from public.sessions
where id = '<assigned-mentor-led-session-id>'
returning id;

rollback;
```

Expected results:

- The `select` returns only sessions accessible to the mentee.
- The `update` returns zero rows.
- The `delete` returns zero rows.
- `rollback` runs as part of the same execution and prevents persistence even if
  a policy is wrong.

If either mutation returns a session row, stop testing and do not deploy the
frontend. Inspect all policies because PostgreSQL combines permissive policies
with `OR`:

```sql
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename = 'sessions'
order by policyname;
```

## 8. Optional isolation test with a third account

For stronger verification, use a third authenticated account that has no
relationship with the mentor.

Repeat the RLS transaction with the third user's UUID and email:

```sql
begin;

set local role authenticated;
set local request.jwt.claims =
  '{"sub":"<unrelated-user-id>","email":"<unrelated-email>","role":"authenticated"}';

select id
from public.sessions;

rollback;
```

Expected result: no mentor-owned sessions are returned.

## 9. Test completion checklist

- [ ] Existing session data was exported.
- [ ] The migration ran successfully.
- [ ] Both new tables exist.
- [ ] `sessions.mentee_id` exists and is nullable.
- [ ] The mentor sent an invitation.
- [ ] The mentee received and accepted the invitation.
- [ ] The relationship row was created.
- [ ] Existing sessions were previewed before assignment.
- [ ] Existing sessions were assigned without changing other data.
- [ ] The mentor can create, update, and delete an owned session.
- [ ] The mentee can read assigned sessions.
- [ ] The mentee cannot update assigned sessions.
- [ ] The mentee cannot delete assigned sessions.
- [ ] An unrelated account cannot read the sessions.
- [ ] Every SQL permission test ended with `rollback`.

For the July 2026 manual test, the mentor-led session checks produced:

- Mentee update: zero affected rows.
- Mentee delete: zero affected rows.
- Unrelated-user select: zero visible rows.
- Separate authenticated browser sessions were tested for mentor and mentee.
- An authenticated account acting as both mentor and mentee was also tested.

## References

- [Supabase database migrations](https://supabase.com/docs/guides/deployment/database-migrations)
- [Supabase local development workflow](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Supabase database backups](https://supabase.com/docs/guides/platform/backups)

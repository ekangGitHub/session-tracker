-- In-app mentor invitations and many-to-many mentor/mentee relationships.
--
-- Sessions remain owned by their original creator in sessions.user_id. The new
-- sessions.mentee_id identifies the one mentee allowed to read that session.
-- Adding a nullable column is non-destructive: existing session rows are kept.

create table if not exists public.mentorship_invitations (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references auth.users(id) on delete cascade,
  mentor_email text,
  mentee_email text not null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined')),
  responded_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint mentorship_invitations_email_normalized
    check (mentee_email = lower(trim(mentee_email)))
);

alter table public.mentorship_invitations
  add column if not exists mentor_email text;

update public.mentorship_invitations as invitation
set mentor_email = lower(users.email)
from auth.users as users
where users.id = invitation.mentor_id
  and invitation.mentor_email is null;

alter table public.mentorship_invitations
  alter column mentor_email set not null;

-- Derive the mentor email from auth.users. Browser clients cannot choose or
-- spoof the value stored on an invitation.
create or replace function public.set_invitation_mentor_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select lower(email)
    into new.mentor_email
    from auth.users
    where id = new.mentor_id;

  if new.mentor_email is null then
    raise exception 'Mentor account email not found';
  end if;

  return new;
end;
$$;

drop trigger if exists set_invitation_mentor_email
  on public.mentorship_invitations;
create trigger set_invitation_mentor_email
  before insert on public.mentorship_invitations
  for each row execute function public.set_invitation_mentor_email();

revoke all on function public.set_invitation_mentor_email() from public;

create unique index if not exists mentorship_invitations_one_pending_idx
  on public.mentorship_invitations (mentor_id, mentee_email)
  where status = 'pending';

create table if not exists public.mentorships (
  id uuid primary key default gen_random_uuid(),
  mentor_id uuid not null references auth.users(id) on delete cascade,
  mentee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint mentorships_different_users check (mentor_id <> mentee_id),
  constraint mentorships_unique_pair unique (mentor_id, mentee_id)
);

create index if not exists mentorships_mentor_id_idx
  on public.mentorships (mentor_id);

create index if not exists mentorships_mentee_id_idx
  on public.mentorships (mentee_id);

alter table public.sessions
  add column if not exists mentee_id uuid references auth.users(id) on delete set null;

alter table public.sessions
  add column if not exists session_origin text not null default 'mentor'
  check (session_origin in ('mentor', 'self_study'));

alter table public.sessions
  add column if not exists mentor_id uuid references auth.users(id) on delete set null;

-- A previous test version of this migration may already have installed the
-- validation trigger. Remove it while existing rows are backfilled.
drop trigger if exists validate_session_participants on public.sessions;

-- Existing rows predate self-study and were created by their mentor.
update public.sessions
set mentor_id = user_id
where session_origin = 'mentor'
  and mentor_id is null;

create index if not exists sessions_mentee_id_idx
  on public.sessions (mentee_id);

create index if not exists sessions_mentor_id_idx
  on public.sessions (mentor_id);

alter table public.mentorship_invitations enable row level security;
alter table public.mentorships enable row level security;
alter table public.sessions enable row level security;
alter table public.session_tasks enable row level security;

-- Data API table privileges are separate from RLS. Newer Supabase projects do
-- not necessarily grant these automatically. RLS policies below still decide
-- which rows each authenticated user may access.
revoke all on table public.mentorship_invitations from anon;
revoke all on table public.mentorships from anon;
revoke all on table public.sessions from anon;
revoke all on table public.session_tasks from anon;
revoke all on table public.mentorship_invitations from authenticated;
revoke all on table public.mentorships from authenticated;
revoke all on table public.sessions from authenticated;
revoke all on table public.session_tasks from authenticated;
grant select, insert on table public.mentorship_invitations to authenticated;
grant select on table public.mentorships to authenticated;
grant select, insert, update, delete on table public.sessions to authenticated;
grant select, insert, update, delete on table public.session_tasks to authenticated;
grant all on table public.mentorship_invitations to service_role;
grant all on table public.mentorships to service_role;
grant all on table public.sessions to service_role;
grant all on table public.session_tasks to service_role;

-- Mentors can create invitations. The invited email can see the invitation after
-- signing in. Acceptance and decline are only possible through the secured RPC.
drop policy if exists "Invitation participants can view invitations"
  on public.mentorship_invitations;
create policy "Invitation participants can view invitations"
  on public.mentorship_invitations
  for select
  to authenticated
  using (
    mentor_id = auth.uid()
    or mentee_email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

drop policy if exists "Authenticated users can invite mentees"
  on public.mentorship_invitations;
create policy "Authenticated users can invite mentees"
  on public.mentorship_invitations
  for insert
  to authenticated
  with check (
    mentor_id = auth.uid()
    and mentee_email <> lower(coalesce(auth.jwt() ->> 'email', ''))
    and status = 'pending'
    and responded_by is null
    and responded_at is null
  );

-- A relationship is visible to its two participants. Rows are created only by
-- the invitation response function; browser clients receive no direct mutation
-- policy on this table.
drop policy if exists "Mentorship participants can view relationships"
  on public.mentorships;
create policy "Mentorship participants can view relationships"
  on public.mentorships
  for select
  to authenticated
  using (mentor_id = auth.uid() or mentee_id = auth.uid());

create or replace function public.respond_to_mentorship_invitation(
  invitation_id uuid,
  accept_invitation boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_email text;
  invitation public.mentorship_invitations%rowtype;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select lower(email)
    into actor_email
    from auth.users
    where id = actor_id;

  select *
    into invitation
    from public.mentorship_invitations
    where id = invitation_id
    for update;

  if not found or invitation.status <> 'pending' then
    raise exception 'Pending invitation not found';
  end if;

  if invitation.mentee_email <> actor_email then
    raise exception 'This invitation belongs to another user';
  end if;

  if accept_invitation then
    insert into public.mentorships (mentor_id, mentee_id)
    values (invitation.mentor_id, actor_id)
    on conflict (mentor_id, mentee_id) do nothing;
  end if;

  update public.mentorship_invitations
    set status = case when accept_invitation then 'accepted' else 'declined' end,
        responded_by = actor_id,
        responded_at = now()
    where id = invitation_id;
end;
$$;

revoke all on function public.respond_to_mentorship_invitation(uuid, boolean)
  from public;
grant execute on function public.respond_to_mentorship_invitation(uuid, boolean)
  to authenticated;

-- Browser clients cannot change who created a session or convert it between a
-- mentor-led and self-study record. A mentor-led record must target a paired
-- mentee; a self-study record must be created for the mentee's own account.
create or replace function public.validate_session_participants()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and (
       old.user_id is distinct from new.user_id
       or old.session_origin is distinct from new.session_origin
     )
     and (select auth.uid()) is not null then
    raise exception 'Session creator and origin cannot be changed';
  end if;

  if new.session_origin = 'self_study' then
    if new.user_id is distinct from new.mentee_id then
      raise exception 'Self-study sessions must belong to the mentee creating them';
    end if;

    if new.mentor_id is null
       or not exists (
         select 1
         from public.mentorships
         where mentorships.mentor_id = new.mentor_id
           and mentorships.mentee_id = new.mentee_id
       ) then
      raise exception 'Select a paired mentor for the self-study session';
    end if;
  elsif new.mentor_id is distinct from new.user_id
     or new.mentee_id is null
     or not exists (
       select 1
       from public.mentorships
       where mentorships.mentor_id = new.user_id
         and mentorships.mentee_id = new.mentee_id
     ) then
    raise exception 'The selected mentee is not paired with this mentor';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_session_participants on public.sessions;
create trigger validate_session_participants
  before insert or update on public.sessions
  for each row execute function public.validate_session_participants();

-- Mentor-led records are managed by their creating mentor and read by the
-- assigned mentee. Mentees manage their own self-study records; the one selected
-- and currently paired mentor may also read and manage each self-study record.
drop policy if exists "Users can view own sessions" on public.sessions;
drop policy if exists "Users can insert own sessions" on public.sessions;
drop policy if exists "Users can update own sessions" on public.sessions;
drop policy if exists "Users can delete own sessions" on public.sessions;

drop policy if exists "Mentors and assigned mentees can view sessions"
  on public.sessions;
create policy "Mentors and assigned mentees can view sessions"
  on public.sessions
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or (
      session_origin = 'mentor'
      and mentee_id = auth.uid()
      and exists (
        select 1
        from public.mentorships
        where mentorships.mentor_id = sessions.user_id
          and mentorships.mentee_id = auth.uid()
      )
    )
    or (
      session_origin = 'self_study'
      and mentor_id = auth.uid()
      and exists (
        select 1
        from public.mentorships
        where mentorships.mentor_id = auth.uid()
          and mentorships.mentee_id = sessions.mentee_id
      )
    )
  );

drop policy if exists "Mentors can create sessions" on public.sessions;
drop policy if exists "Participants can create sessions" on public.sessions;
create policy "Participants can create sessions"
  on public.sessions
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and (
      (
        session_origin = 'self_study'
        and mentee_id = auth.uid()
        and mentor_id is not null
        and exists (
          select 1
          from public.mentorships
          where mentorships.mentor_id = sessions.mentor_id
            and mentorships.mentee_id = auth.uid()
        )
      )
      or (
        session_origin = 'mentor'
        and mentor_id = auth.uid()
        and exists (
          select 1
          from public.mentorships
          where mentorships.mentor_id = auth.uid()
            and mentorships.mentee_id = sessions.mentee_id
        )
      )
    )
  );

drop policy if exists "Mentors can update their sessions" on public.sessions;
drop policy if exists "Session managers can update sessions" on public.sessions;
create policy "Session managers can update sessions"
  on public.sessions
  for update
  to authenticated
  using (
    user_id = auth.uid()
    or (
      session_origin = 'self_study'
      and mentor_id = auth.uid()
      and exists (
        select 1
        from public.mentorships
        where mentorships.mentor_id = auth.uid()
          and mentorships.mentee_id = sessions.mentee_id
      )
    )
  )
  with check (
    user_id = auth.uid()
    or (
      session_origin = 'self_study'
      and mentor_id = auth.uid()
      and exists (
        select 1
        from public.mentorships
        where mentorships.mentor_id = auth.uid()
          and mentorships.mentee_id = sessions.mentee_id
      )
    )
  );

drop policy if exists "Mentors can delete their sessions" on public.sessions;
drop policy if exists "Session managers can delete sessions" on public.sessions;
create policy "Session managers can delete sessions"
  on public.sessions
  for delete
  to authenticated
  using (
    user_id = auth.uid()
    or (
      session_origin = 'self_study'
      and mentor_id = auth.uid()
      and exists (
        select 1
        from public.mentorships
        where mentorships.mentor_id = auth.uid()
          and mentorships.mentee_id = sessions.mentee_id
      )
    )
  );

-- Tasks inherit access from their parent session. The session creator and
-- paired mentors who manage a self-study session may mutate its tasks.
drop policy if exists "Session participants can view tasks"
  on public.session_tasks;
create policy "Session participants can view tasks"
  on public.session_tasks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.sessions
      where sessions.id = session_tasks.session_id
    )
  );

drop policy if exists "Mentors can create session tasks"
  on public.session_tasks;
drop policy if exists "Session managers can create session tasks"
  on public.session_tasks;
create policy "Session managers can create session tasks"
  on public.session_tasks
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1
      from public.sessions
      where sessions.id = session_tasks.session_id
        and (
          sessions.user_id = auth.uid()
          or (
            sessions.session_origin = 'self_study'
            and sessions.mentor_id = auth.uid()
            and exists (
              select 1
              from public.mentorships
              where mentorships.mentor_id = auth.uid()
                and mentorships.mentee_id = sessions.mentee_id
            )
          )
        )
    )
  );

drop policy if exists "Mentors can update session tasks"
  on public.session_tasks;
drop policy if exists "Session managers can update session tasks"
  on public.session_tasks;
create policy "Session managers can update session tasks"
  on public.session_tasks
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.sessions
      where sessions.id = session_tasks.session_id
        and (
          sessions.user_id = auth.uid()
          or (
            sessions.session_origin = 'self_study'
            and sessions.mentor_id = auth.uid()
            and exists (
              select 1
              from public.mentorships
              where mentorships.mentor_id = auth.uid()
                and mentorships.mentee_id = sessions.mentee_id
            )
          )
        )
    )
  );

drop policy if exists "Mentors can delete session tasks"
  on public.session_tasks;
drop policy if exists "Session managers can delete session tasks"
  on public.session_tasks;
create policy "Session managers can delete session tasks"
  on public.session_tasks
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.sessions
      where sessions.id = session_tasks.session_id
        and (
          sessions.user_id = auth.uid()
          or (
            sessions.session_origin = 'self_study'
            and sessions.mentor_id = auth.uid()
            and exists (
              select 1
              from public.mentorships
              where mentorships.mentor_id = auth.uid()
                and mentorships.mentee_id = sessions.mentee_id
            )
          )
        )
    )
  );

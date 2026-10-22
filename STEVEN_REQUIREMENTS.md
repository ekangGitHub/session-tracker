# Session Tracker — Requirements for Steven

Owner: Steven  
Status: Planned

Implement the following four tasks. Preserve existing session data and the
mentor, mentee, and dual-role workflows.

## 1. Build PostgreSQL user profiles and display names

Priority: Start here. The main learning objective is hands-on PostgreSQL
experience through Supabase: relational schema design, SQL migrations,
queries, and row-level security. Complete the database work before integrating
profile names into the UI.

- Add a version-controlled migration for a protected `profiles` table keyed by
  `auth.users.id`, with separate `first_name` and `last_name` fields.
- Define the UUID primary key and foreign key relationship explicitly in SQL,
  including the intended behavior when an authentication user is deleted.
- Write SQL to initialize profiles for existing accounts without overwriting
  names, and document how profiles are created for new accounts.
- Support profile creation for new and existing accounts and provide a way for
  users to enter and edit their own names. Missing names must not break existing
  accounts or records.
- Display names consistently in invitations, connections, selection dropdowns,
  and session-history headings. Handle partially completed names gracefully.
- Use the available name first, an already-authorized email as fallback, and a
  shortened user ID as the final fallback.
- Resolve names through profiles rather than copying them into session rows.
- Allow users to edit their own profiles and connected users to read only the
  profile information needed for display. Do not allow unrelated users to browse
  profiles or query authentication records from the browser.
- Add meaningful SQL checks for profile permissions, including allowed reads
  and updates and rejected access by unrelated users. Run these checks using
  authenticated user contexts so they exercise RLS.
- Include example SQL queries that join profiles with mentorship relationships
  to retrieve mentor/mentee names. Explain the schema, constraints, migration,
  and RLS policies in the pull request, with validation results.

Acceptance: Name edits appear throughout the app; legacy accounts retain useful
labels; users cannot edit another person's profile or read unrelated profiles.

## 2. Separate Connections and Sessions

- Add navigation between dedicated Connections and Sessions pages.
- Connections must support sending invitations, viewing sent and received
  invitations, accepting/declining incoming invitations, and viewing existing
  relationships.
- Show My Mentors and My Mentees sections for users with both roles.
- Add a View sessions link for each relationship. Open Sessions filtered to that
  relationship, with a way to return to all authorized sessions.
- Keep session creation, editing, deletion, and history on Sessions.
- Suggested routes: `/connections`, `/sessions`,
  `/sessions?mentor=<user-id>`, and `/sessions?mentee=<user-id>`.
- Include mentor-led records and self-study records associated with the selected
  relationship. A self-study record belongs to its selected mentor relationship,
  rather than being shown to every paired mentor.
- Treat URL filters as display filters; database row-level security (RLS) must
  enforce access even when users change query parameters.

Acceptance: Mentor-only, mentee-only, and dual-role accounts can use both pages;
relationship links show the correct records; existing session workflows work.

## 3. Remove the page's header images

- Remove the React/Vite starter logos currently displayed on the Session Tracker
  page, including their links and unused imports, styles, and animation.
- Adjust spacing around the title and content for desktop and mobile.

Acceptance: No header logos, empty image spaces, or broken image placeholders
remain; the application builds successfully.

## 4. Deploy to Vercel or Render

- Deploy to either host and provide the live HTTPS URL.
- Connect the GitHub repository and configure automatic deployment from the
  agreed production branch.
- Use `npm run build` and publish `dist`.
- Update the current `/session-tracker/` Vite base path for the deployment URL.
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the hosting
  environment. Keep Supabase service-role credentials out of the frontend.
- Configure the Supabase site URL and OAuth redirect allowlist for production,
  retaining required development URLs.
- Ensure direct navigation and refresh work on Connections and Sessions,
  including filtered URLs.
- Verify Google sign-in/sign-out, invitations, profiles, and session workflows
  on the deployed application.
- Document hosting settings, environment variable names, authentication URLs,
  redeployment, and rollback in README.md.

Acceptance: The live app loads over HTTPS; sign-in returns to the correct site;
routes survive refresh; mentor/mentee workflows and access controls work.

## Existing permissions to preserve

- Mentors manage mentor-led records they own; the assigned mentee can read them.
- Mentees manage their own self-study records; the selected paired mentor can
  view, edit, or delete those records.
- Unrelated accounts cannot access these records.
- Schema changes preserve existing sessions and relationships.

## GitHub workflow and delivery

- After accepting the repository collaborator invitation, clone the repository
  and follow README.md for local setup.
- Create a feature branch for each task and submit pull requests for review
  before merging into `main`. Identify dependencies between pull requests.
- Include a short description, screenshots for UI changes, validation results,
  and any database migration or hosting setup steps in each pull request.
- Include SQL migrations in the repository and document their application order.
- Run `npm run build` and `npm run lint`; report any remaining failures.
- Verify with mentor, mentee, dual-role, and unrelated test accounts. Include
  checks that unauthorized profile/session reads and writes are rejected.
- Deliver the live deployment URL and updated setup/deployment documentation.

The wider project review is in [CODE_ANALYSIS_AND_RECOMMENDATIONS.md](CODE_ANALYSIS_AND_RECOMMENDATIONS.md).
This document defines Steven's current scope; the other review recommendations
are separate backlog items.

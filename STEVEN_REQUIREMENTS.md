# Session Tracker — Requirements for Steven

Owner: Steven  
Status: Planned

Implement the following four tasks. Preserve existing session data and the
mentor, mentee, and dual-role workflows.

## 1. Build a Java profile API with PostgreSQL and display names

Priority: Start here. The learning objectives are hands-on Java and PostgreSQL
experience: Spring Boot, REST APIs, relational schema design, SQL migrations,
queries, authentication, and row-level security. Complete the database and API
work before integrating profile names into the UI.

Architecture: React/TypeScript frontend → Java/Spring Boot profile API → existing
Supabase PostgreSQL database. Keep Supabase Auth for Google sign-in and the
existing session/invitation flows. Page separation and image removal remain
React/TypeScript work.

### PostgreSQL schema and permissions

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

### Java/Spring Boot API

- Add the Java service in a `backend/` directory with a reproducible Maven or
  Gradle build and documented Java version.
- Implement authenticated endpoints such as `GET /api/profiles/me`,
  `PUT /api/profiles/me`, and `GET /api/profiles/{userId}`. Document request and
  response fields and profile initialization behavior.
- Implement profile persistence against the existing PostgreSQL database using
  Spring Data JPA or JDBC. Keep the version-controlled SQL migrations as the
  source of schema changes rather than relying on automatic ORM schema updates.
- Validate Supabase access tokens using Spring Security, checking signature,
  issuer, expiry, and the intended audience. Derive the acting user's ID from the
  validated token rather than a client-supplied user ID.
- Restrict updates to the acting user's profile. Allow reads only for that user
  and authorized connections; return only the profile fields needed for display.
- Define input limits and validation for names and return consistent JSON errors
  for invalid input, missing/invalid authentication, and denied access.
- Document the database role and how authenticated user identity reaches RLS
  for each database transaction. A server connection must not silently bypass
  RLS; establish transaction-local user context with a restricted database role
  and verify it with integration tests. Never expose database credentials or
  privileged Supabase keys to the browser.
- Configure CORS for the actual development and production frontend origins.
- Connect the React profile UI and name lookups to this API, sending the current
  Supabase access token. Handle loading, expired sessions, and API failures.
- Add Java API/database integration tests for persistence, validation, token
  rejection, own-profile updates, connected-profile reads, denied unrelated
  access, and denied updates to another user's profile. Verify both API
  authorization and database policies using a test PostgreSQL environment.
- Document local backend setup, environment variable names, migration steps,
  endpoint examples, and the command to run the Java test suite.

Acceptance: The React UI reads and updates profiles through the Java API; changes
persist in PostgreSQL and appear throughout the app; legacy accounts retain
useful labels; API and SQL permission checks reject unauthorized access.

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

- Deploy the React frontend to Vercel or Render, and deploy the Java/Spring Boot
  API to a Java-capable service such as a Render web service. Provide both live
  HTTPS URLs and document the chosen arrangement.
- Connect the GitHub repository and configure automatic deployment from the
  agreed production branch.
- Use `npm run build` and publish `dist`.
- Update the current `/session-tracker/` Vite base path for the deployment URL.
- Configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the hosting
  environment. Keep Supabase service-role credentials out of the frontend.
- Configure the frontend API base URL and the backend's database connection,
  authentication validation, and allowed frontend origins. Store backend secrets
  only in the backend hosting environment.
- Document the backend build/start commands, required Java version, health check,
  and any hosting limitations that affect availability.
- Configure the Supabase site URL and OAuth redirect allowlist for production,
  retaining required development URLs.
- Ensure direct navigation and refresh work on Connections and Sessions,
  including filtered URLs.
- Verify Google sign-in/sign-out, invitations, profiles, and session workflows
  on the deployed application.
- Document hosting settings, environment variable names, authentication URLs,
  redeployment, and rollback in README.md.

Acceptance: The live frontend and Java API work together over HTTPS; sign-in
returns to the correct site; routes survive refresh; profile updates persist;
mentor/mentee workflows and access controls work.

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
- Run the Java build and integration test suite and include results in the
  profile API pull request.
- Verify with mentor, mentee, dual-role, and unrelated test accounts. Include
  checks that unauthorized profile/session reads and writes are rejected.
- Deliver frontend and API deployment URLs and updated setup/deployment
  documentation.

The wider project review is in [CODE_ANALYSIS_AND_RECOMMENDATIONS.md](CODE_ANALYSIS_AND_RECOMMENDATIONS.md).
This document defines Steven's current scope; the other review recommendations
are separate backlog items.

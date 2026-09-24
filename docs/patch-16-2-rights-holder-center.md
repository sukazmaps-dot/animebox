# Patch 16.2 — Rights Holder Center & Takedown System

## Goal

Give AnimeBox a real, auditable workflow for rights-holder notices before international expansion. This patch is compliance infrastructure; it does not claim that a notice page by itself changes the legal status of any content.

## Public flow

- \`/copyright\` provides Russian instructions plus an English rights-holder summary.
- \`copyright@youranimebox.com\` is the dedicated contact.
- The public form requires claimant identity, contact email, role, work, exact AnimeBox URLs, rights description, authority statement, signature and good-faith confirmation.
- Intake is rate limited and only writes through a server API.
- Successful submissions receive an \`AB-CR-...\` case number.

## Data model

- \`copyright_cases\`
- \`copyright_case_urls\`
- \`copyright_actions\`
- \`copyright_restrictions\`

All tables have RLS enabled and direct \`anon\` / \`authenticated\` access revoked. The application uses service-role access on the server.

## Admin flow

\`/admin/copyright\` is limited to owner/admin roles and supports:

- status review;
- claimant/URL inspection;
- title, season, episode and provider restrictions;
- lifting restrictions;
- admin audit events.

## Anti-reappear enforcement

Playback endpoints check \`copyright_restrictions\` before returning a playable source:

- Kodik;
- AniLiberty;
- AnimeBox Direct.

A restricted provider cannot simply reappear because a provider lookup found it again. Provider-specific restrictions leave other sources available; title/season/episode restrictions can suppress every provider matching the same scope.

## Deployment notes

Apply the Supabase migration \`20260924083240_copyright_rights_holder_center_v1.sql\` before relying on the public form or admin center in production.

Restriction lookups intentionally fail open while the migration is absent so a partial deploy cannot take playback down platform-wide.

Configure mail routing for \`copyright@youranimebox.com\` before publishing the page broadly.

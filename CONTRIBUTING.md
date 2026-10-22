# Contributing to AnimeBox

Thanks for helping improve AnimeBox. Changes are reviewed before they are merged; opening a PR does not imply automatic acceptance or production deployment.

## Development setup

Requirements: Node.js 22 and npm.

1. Clone the repository and install the lockfile dependencies:

   ```bash
   git clone https://github.com/sukazmaps-dot/animebox.git
   cd animebox
   npm ci
   ```

2. Create a local environment file:

   - Windows CMD: `copy .env.example .env.local`
   - PowerShell: `Copy-Item .env.example .env.local`
   - macOS/Linux: `cp .env.example .env.local`

3. Configure a local Supabase instance or a dedicated test project before testing database-backed features. The template deliberately points to localhost so local development does not silently use the built-in project fallback. Replace the example publishable key with a local/test key.
4. Start Next.js:

   ```bash
   npm run dev
   ```

   Open http://localhost:3000. Without test-service configuration, sign-in, user-specific features, and some server integrations may not work. Do not use production credentials or production user data for local development.

## Security rules

- Never commit `.env.local`, `.env`, provider tokens, service-role keys, private keys, database dumps, user data, or logs containing sensitive values.
- Server secrets must remain server-side. Never rename a secret to a `NEXT_PUBLIC_*` variable; Next.js can expose those values in client bundles.
- Do not configure production Supabase, Telegram, payment, cron, or hosting credentials in a contributor's local environment.
- Do not run SQL migrations or scripts against production unless the project owner has explicitly reviewed and approved that exact operation.
- If you believe a credential was exposed, notify the project owner privately and rotate it. Do not paste the credential into an issue or PR.

## Branches and pull requests

1. Start from the latest `main` and create a focused branch. Suggested names: `fix/poster-fallback`, `feat/catalog-filter`, `refactor/css-file-name`, or `docs/local-setup`.
2. Keep each PR focused on one problem. Avoid unrelated formatting, mass renames, generated files, and dependency upgrades mixed into a feature fix.
3. Before editing existing code, search for callers, imports, tests, and related open PRs. Do not duplicate work already in progress.
4. Explain the observed problem, its cause, the change made, and any known limitations. Add regression tests when practical.
5. For UI changes, attach before/after screenshots and mention tested viewport sizes. For API or data changes, describe error handling and migration implications.
6. Run the narrow checks relevant to your change. Useful starting points:

   ```bash
   npm run lint
   npm run security:check
   npm run css:inventory:check
   ```

   The full `npm run build` runs a large prebuild quality gate and can take substantially longer. GitHub Actions also runs the repository Quality Gate for PRs. Report checks you did not run; do not state that a check passed unless it actually did.
7. Keep the PR as a draft while work is incomplete. The maintainer reviews and merges changes; contributors do not deploy to production.

## CSS-specific guidance

AnimeBox currently has a large global CSS cascade and route-specific styles. Preserve behavior while the architecture is gradually improved.

- Do not delete a stylesheet just because it is not imported directly by `app/layout.tsx`; route layouts and components may import it.
- For a mechanical rename, change the file path and its imports only. Preserve the exact CSS contents and import order; do not combine a rename with selector/value cleanup.
- Search across routes, components, scripts, and tests before changing a filename or removing a style.
- Prefer small, reviewable changes with targeted regression checks over mass rewrites of patch-named files.

## Scope and access

Use the smallest access needed for the assigned task. Repository access does not grant access to production services, deployment settings, secrets, or customer data.

# Patch 18.5.3.1 — Copyright Takedown Shield

## Goal

Turn the existing Rights Holder Center from a provider-level playback switch into a complete takedown enforcement layer.

The patch must allow AnimeBox to react to an external copyright notice without deleting the informational title page and without leaving watch URLs, video SEO, sitemaps or provider endpoints exposed.

## Product behavior

### Title-level restriction

An active `scope=title` restriction means:

- the title information page remains available;
- no "watch" CTA is shown;
- episode navigation is removed from the title page;
- Watch Together promotion for that title is hidden;
- the page is described as an informational page, not "watch online";
- WatchAction structured data is not emitted;
- all episode pages for the title render a controlled restricted state instead of the player;
- episode metadata is `noindex`;
- episode XML sitemap entries are suppressed;
- video sitemap entries are suppressed;
- provider endpoints continue returning the existing copyright-restricted policy / HTTP 451 behavior.

### Episode / season restrictions

- episode restrictions suppress the exact episode from SEO and playback;
- season restrictions are treated conservatively by episode SEO for the corresponding AnimeBox title id;
- provider-only restrictions do not automatically deindex an episode when another provider can still serve it.

## External notice intake

The admin Rights Holder Center gains a "External takedown" workflow for notices received via Google, Lumen, a registrar, CDN, host or other intermediary.

The operator records:

- work/title name;
- AnimeBox AniList id;
- sender / agent label;
- external reference (for example a Lumen notice id);
- source URL;
- affected AnimeBox URLs;
- internal reason.

Submitting the form creates an internal copyright case and an active title restriction in one action.

Direct reports submitted through the public AnimeBox form keep their existing stricter claimant/contact validation.

## Data model

`copyright_cases` gains:

- `source_type`: `direct_notice` or `external_platform`;
- `external_reference`;
- `source_url`.

Claimant/contact/signature fields become nullable only so imported external notices can be represented truthfully without inventing a claimant email or signature. A database check keeps those fields mandatory for `direct_notice` cases.

## SEO shield

The shield must be resistant to stale SEO caches:

- `isEpisodeIndexable` checks copyright before provider availability;
- `syncSeoEpisodeIndex` never re-enables a restricted episode;
- creating a title/season/episode restriction immediately marks affected `seo_episode_index` rows non-indexable;
- lifting a restriction does **not** blindly mark them indexable again — normal provider verification must re-confirm playback first;
- episode sitemap and video sitemap independently filter current active restrictions at request time.

## UX

Restricted episode pages use a branded, calm state:

- "Просмотр недоступен";
- no player, source selector or watch controls are mounted;
- link back to the title;
- link to the copyright / rights-holder page;
- no public case id, claimant email or internal note is exposed.

The title page remains useful for description, genres, rating and library/tracker features.

## Security and reliability

- all admin mutations remain owner/admin protected;
- browser mutation / CSRF checks remain enforced;
- actions are written to the admin audit log;
- external URL input accepts only HTTP(S);
- affected AnimeBox URLs must belong to `youranimebox.com`;
- restriction enforcement stays server-side;
- copyright DB failures must not crash public pages.

## Regression gate

A dedicated static gate must verify:

- external notice schema support;
- title/episode server enforcement;
- provider policy still contains copyright checks;
- restricted episode metadata is noindex;
- title page does not render watch UI when restricted;
- fresh SEO sync cannot resurrect restricted entries;
- both episode and video sitemaps apply the restriction filter;
- admin external takedown action is audited;
- production build passes.

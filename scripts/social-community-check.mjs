import fs from 'node:fs';

const read = (path) =>
  fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

const migration = read('supabase/migrations/20260924193648_social_community_v2.sql');
const socialServer = read('lib/social-community-server.ts');
const presence = read('components/social/SocialPresenceHeartbeat.tsx');
const friends = read('components/friends/FriendsPageClient.tsx');
const panels = read('components/friends/SocialGraphPanels.tsx');
const commentsApi = read('app/api/comments/route.ts');
const commentsUi = read('components/EpisodeComments.tsx');
const notifications = read('lib/social-notifications-server.ts');
const notificationsUi = read('components/SocialNotificationsClient.tsx');
const adminApi = read('app/api/admin/community/route.ts');
const adminUi = read('components/admin/CommunityAdminClient.tsx');
const layout = read('app/layout.tsx');

const failures = [];

for (const needle of [
  'create table if not exists public.social_presence',
  'create table if not exists public.social_privacy',
  'create table if not exists public.comment_reports',
  "'comment_reply'::text",
  "'comment_mention'::text",
  'alter table public.social_presence enable row level security',
  'alter table public.social_privacy enable row level security',
  'alter table public.comment_reports enable row level security',
]) {
  if (!migration.includes(needle)) {
    failures.push(`social migration missing: ${needle}`);
  }
}

for (const forbidden of ['latitude','longitude','ip_address','device_id','user_agent']) {
  if (migration.toLowerCase().includes(forbidden)) {
    failures.push(`presence storage must not persist ${forbidden}`);
  }
}

if (
  !socialServer.includes('searchFriendDiscovery') ||
  !socialServer.includes('getFriendActivity') ||
  !socialServer.includes('show_online_to_friends') ||
  !socialServer.includes('show_activity_to_friends')
) {
  failures.push('friends-only discovery/activity/privacy contract is incomplete');
}

if (
  !presence.includes("document.visibilityState !== 'visible'") ||
  !presence.includes('window.setInterval') ||
  !presence.includes('/api/social/presence') ||
  !layout.includes('SocialPresenceHeartbeat')
) {
  failures.push('coarse authenticated presence heartbeat is incomplete');
}

if (
  !friends.includes('SocialGraphPanels') ||
  !friends.includes('SOCIAL GRAPH · 17.7') ||
  !panels.includes('/api/friends/discover') ||
  !panels.includes('/api/friends/activity') ||
  !panels.includes('/api/social/privacy')
) {
  failures.push('friends hub is missing discovery/activity/privacy surfaces');
}

if (
  !commentsApi.includes('publishEpisodeCommentSocialEffects') ||
  !notifications.includes("'comment_reply'") ||
  !notifications.includes("'comment_mention'") ||
  !notificationsUi.includes("item.type === 'comment_reply'") ||
  !notificationsUi.includes("item.type === 'comment_mention'")
) {
  failures.push('discussion reply/mention social inbox contract is incomplete');
}

if (
  !commentsUi.includes('/api/comments/report') ||
  !commentsUi.includes('comment-') ||
  !commentsUi.includes("window.location.hash.startsWith('#comment-')")
) {
  failures.push('episode comment moderation/anchor UX is incomplete');
}

if (
  !adminApi.includes("from('comment_reports')") ||
  !adminApi.includes("action === 'delete_comment'") ||
  !adminApi.includes("action === 'resolve_comment_report'") ||
  !adminApi.includes('comments24h') ||
  !adminApi.includes('onlineNow') ||
  !adminUi.includes('EPISODE COMMENT REPORTS')
) {
  failures.push('Community Admin comment moderation/analytics is incomplete');
}

if (failures.length) {
  console.error('[AnimeBox Social & Community 17.7] Check failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[AnimeBox Social & Community 17.7] friends, presence, inbox and moderation invariants passed.');

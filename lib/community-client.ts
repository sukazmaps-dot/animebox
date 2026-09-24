import type { ProfileProgression, AchievementCategory, AchievementRarity } from '@/lib/progression';
import type { ChallengeSnapshot } from '@/lib/challenges';
import type { WatchTitleOverview } from '@/types/watch';
import type { ProfileWidgetsData } from '@/types/profile-widgets';

export async function communityRequest<T>(
  path: string,
  body?: unknown,
  explicitMethod?: 'GET' | 'POST' | 'PUT' | 'DELETE',
): Promise<T> {
  const method = explicitMethod ?? (body === undefined ? 'GET' : 'POST');
  const result = await fetch(`/api/community/${path}`, {
    method,
    cache: 'no-store',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await result.json();
  if (!result.ok) throw new Error(data.error || 'Ошибка сервера.');

  if (
    typeof window !== 'undefined' &&
    data &&
    typeof data === 'object' &&
    !Array.isArray(data) &&
    Boolean((data as Record<string, unknown>).progressionUpdated)
  ) {
    window.dispatchEvent(new Event('animebox:progression-updated'));
  }

  return data as T;
}

export const statusLabels = {
  watching: 'Смотрю',
  planned: 'В планах',
  completed: 'Просмотрено',
  dropped: 'Брошено',
};

export type LibraryStatus = keyof typeof statusLabels;
export type CommunityProfile = {
  stats: {
    episodes: number;
    titles: number;
    minutes: number;
    watch_minutes: number;
    active_ms: number;
    shonen_titles: number;
    romance_titles: number;
    action_titles: number;
    fantasy_titles: number;
    comedy_titles: number;
    longest_streak: number;
    comments: number;
  } & Record<LibraryStatus, number>;
  progression: ProfileProgression;
  challenges: ChallengeSnapshot;
  featuredAchievements: string[];
  widgets: ProfileWidgetsData;
  achievements: {
    code: string;
    title: string;
    description: string;
    icon: string;
    earned_at: string | null;
    metric: string;
    threshold: number;
    category: AchievementCategory;
    rarity: AchievementRarity;
    xp_reward: number;
    hidden: boolean;
    sort_order: number;
  }[];
  library: {
    anime_id: number;
    title: string;
    status: LibraryStatus;
    progress?: WatchTitleOverview | null;
  }[];
};

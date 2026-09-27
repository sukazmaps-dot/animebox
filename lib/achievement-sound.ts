'use client';

export type AchievementSoundRarity =
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'epic'
  | 'legendary';

export type AchievementSoundKind =
  | 'character_intro'
  | 'battle'
  | 'tension'
  | 'reveal'
  | 'secret'
  | 'death'
  | 'finale'
  | 'arc_complete'
  | 'episode_milestone'
  | string;

export const ACHIEVEMENT_SOUND_STORAGE_KEY =
  'animebox:achievement-sounds-enabled';
export const ACHIEVEMENT_SOUND_VOLUME = 0.32;

const ACHIEVEMENT_SOUND_COOLDOWN_MS = 900;
const PLAYED_EVENT_CACHE_LIMIT = 120;

const SOUND_BY_RARITY: Record<AchievementSoundRarity, string> = {
  common: '/audio/achievements/common-sparkle.mp3',
  uncommon: '/audio/achievements/common-sparkle.mp3',
  rare: '/audio/achievements/rare-wand.mp3',
  epic: '/audio/achievements/epic-whoosh.mp3',
  legendary: '/audio/achievements/legendary-spell.mp3',
};

const REVEAL_SOUND = '/audio/achievements/reveal-chime.mp3';

const RARITY_PRIORITY: Record<AchievementSoundRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5,
};

const audioPool = new Map<string, HTMLAudioElement>();
const playedEventIds = new Set<string>();

let activeAudio: HTMLAudioElement | null = null;
let lastPlayedAt = 0;
let lastPriority = 0;
let warmed = false;

function browserReady() {
  return typeof window !== 'undefined' && typeof Audio !== 'undefined';
}

function rememberPlayedEvent(eventId: string) {
  playedEventIds.add(eventId);

  while (playedEventIds.size > PLAYED_EVENT_CACHE_LIMIT) {
    const oldest = playedEventIds.values().next().value as string | undefined;
    if (!oldest) break;
    playedEventIds.delete(oldest);
  }
}

function soundEnabledFromStorage() {
  if (typeof window === 'undefined') return true;

  try {
    return window.localStorage.getItem(ACHIEVEMENT_SOUND_STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function audioFor(src: string) {
  if (!browserReady()) return null;

  const cached = audioPool.get(src);
  if (cached) return cached;

  const audio = new Audio(src);
  audio.preload = 'auto';
  audio.volume = ACHIEVEMENT_SOUND_VOLUME;
  audioPool.set(src, audio);
  return audio;
}

function stopActiveAudio() {
  if (!activeAudio) return;

  try {
    activeAudio.pause();
    activeAudio.currentTime = 0;
  } catch {
    // Audio feedback must never interfere with the player or Journey unlock.
  }

  activeAudio = null;
}

export function achievementSoundsEnabled() {
  return soundEnabledFromStorage();
}

export function setAchievementSoundsEnabled(enabled: boolean) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      ACHIEVEMENT_SOUND_STORAGE_KEY,
      enabled ? '1' : '0',
    );
  } catch {
    // Private mode/storage failures are non-fatal.
  }

  if (!enabled) stopActiveAudio();

  window.dispatchEvent(
    new CustomEvent('animebox:achievement-sound-setting-changed', {
      detail: { enabled },
    }),
  );
}

export function effectiveAchievementSoundRarity(
  rarity: AchievementSoundRarity,
  kind?: AchievementSoundKind | null,
): AchievementSoundRarity {
  if (kind === 'arc_complete' || kind === 'finale') {
    return 'legendary';
  }

  return rarity;
}

export function prepareAchievementSounds() {
  if (!browserReady() || warmed) return;
  warmed = true;

  for (const src of new Set([
    ...Object.values(SOUND_BY_RARITY),
    REVEAL_SOUND,
  ])) {
    audioFor(src)?.load();
  }
}

export function installAchievementSoundWarmup() {
  if (typeof window === 'undefined') return () => undefined;

  const warm = () => {
    prepareAchievementSounds();
    window.removeEventListener('pointerdown', warm);
    window.removeEventListener('keydown', warm);
    window.removeEventListener('touchstart', warm);
  };

  window.addEventListener('pointerdown', warm, { passive: true });
  window.addEventListener('keydown', warm);
  window.addEventListener('touchstart', warm, { passive: true });

  return () => {
    window.removeEventListener('pointerdown', warm);
    window.removeEventListener('keydown', warm);
    window.removeEventListener('touchstart', warm);
  };
}

async function playSound(src: string, priority: number) {
  if (!browserReady() || !achievementSoundsEnabled()) return false;

  const now = Date.now();
  const insideCooldown = now - lastPlayedAt < ACHIEVEMENT_SOUND_COOLDOWN_MS;

  if (insideCooldown && priority <= lastPriority) {
    return false;
  }

  const audio = audioFor(src);
  if (!audio) return false;

  stopActiveAudio();
  activeAudio = audio;
  lastPlayedAt = now;
  lastPriority = priority;

  try {
    audio.currentTime = 0;
    audio.volume = ACHIEVEMENT_SOUND_VOLUME;
    await audio.play();
    return true;
  } catch {
    if (activeAudio === audio) activeAudio = null;
    return false;
  }
}

export async function playAchievementUnlockSound(input: {
  eventId: string;
  rarity: AchievementSoundRarity;
  kind?: AchievementSoundKind | null;
}) {
  if (!input.eventId || playedEventIds.has(input.eventId)) return false;

  rememberPlayedEvent(input.eventId);

  const rarity = effectiveAchievementSoundRarity(input.rarity, input.kind);
  return playSound(SOUND_BY_RARITY[rarity], RARITY_PRIORITY[rarity]);
}

export async function playAchievementRevealSound() {
  return playSound(REVEAL_SOUND, 1);
}

'use client';

import { useMemo, useState } from 'react';

import { achievementIcon } from '@/lib/achievement-icons';
import {
  ACHIEVEMENT_RARITY_LABELS,
  type AchievementRarity,
} from '@/lib/progression';
import type { CommunityProfile } from '@/lib/community-client';

import styles from './AchievementShowcaseEditor.module.css';

type Props = {
  achievements: CommunityProfile['achievements'];
  featuredCodes: string[];
  onSaved: (codes: string[]) => void;
};

export default function AchievementShowcaseEditor({
  achievements,
  featuredCodes,
  onSaved,
}: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(featuredCodes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const earned = useMemo(
    () => achievements.filter((achievement) => Boolean(achievement.earned_at)),
    [achievements],
  );

  const toggle = (code: string) => {
    setError('');
    setSelected((current) => {
      if (current.includes(code)) {
        return current.filter((item) => item !== code);
      }

      if (current.length >= 3) {
        setError('В витрину можно добавить максимум 3 достижения.');
        return current;
      }

      return [...current, code];
    });
  };

  const close = () => {
    if (saving) return;
    setSelected(featuredCodes);
    setError('');
    setOpen(false);
  };

  const save = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/community/featured-achievements', {
        method: 'PUT',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codes: selected }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        codes?: string[];
      };

      if (!response.ok) {
        throw new Error(payload.error || 'Не удалось сохранить витрину.');
      }

      const next = Array.isArray(payload.codes) ? payload.codes : selected;
      onSaved(next);
      setOpen(false);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Ошибка сохранения.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => {
          setSelected(featuredCodes);
          setError('');
          setOpen(true);
        }}
      >
        Настроить витрину
      </button>

      {open && (
        <div className={styles.backdrop} role="presentation" onMouseDown={close}>
          <section
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="achievement-showcase-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className={styles.header}>
              <div>
                <span>ПРОФИЛЬНАЯ ВИТРИНА</span>
                <h2 id="achievement-showcase-title">Выбери до 3 достижений</h2>
                <p>Они будут первыми видны в твоём публичном профиле.</p>
              </div>

              <button type="button" className={styles.close} onClick={close} aria-label="Закрыть">
                ×
              </button>
            </header>

            <div className={styles.slots} aria-label="Выбранные достижения">
              {[0, 1, 2].map((index) => {
                const code = selected[index];
                const achievement = earned.find((item) => item.code === code);

                return (
                  <div className={styles.slot} data-filled={Boolean(achievement)} key={index}>
                    {achievement ? (
                      <>
                        <img src={achievementIcon(achievement.code, achievement.icon)} alt="" />
                        <span>{achievement.title}</span>
                      </>
                    ) : (
                      <>
                        <strong>{index + 1}</strong>
                        <span>Свободное место</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={styles.list}>
              {earned.length ? earned.map((achievement) => {
                const active = selected.includes(achievement.code);
                const rarity = achievement.rarity as AchievementRarity;

                return (
                  <button
                    type="button"
                    className={styles.item}
                    data-active={active}
                    data-rarity={rarity}
                    key={achievement.code}
                    onClick={() => toggle(achievement.code)}
                  >
                    <img src={achievementIcon(achievement.code, achievement.icon)} alt="" />
                    <span>
                      <strong>{achievement.title}</strong>
                      <small>{ACHIEVEMENT_RARITY_LABELS[rarity]} · +{achievement.xp_reward} XP</small>
                    </span>
                    <b>{active ? '✓' : '+'}</b>
                  </button>
                );
              }) : (
                <div className={styles.empty}>
                  Сначала открой хотя бы одно достижение.
                </div>
              )}
            </div>

            {error && <p className={styles.error} role="alert">{error}</p>}

            <footer className={styles.footer}>
              <span>{selected.length} / 3 выбрано</span>
              <div>
                <button type="button" className={styles.secondary} onClick={close} disabled={saving}>
                  Отмена
                </button>
                <button type="button" className={styles.primary} onClick={() => void save()} disabled={saving}>
                  {saving ? 'Сохраняем…' : 'Сохранить'}
                </button>
              </div>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}

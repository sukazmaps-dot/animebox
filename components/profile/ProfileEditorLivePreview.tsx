'use client';
import ProfileFrameOverlay from '@/components/profile/ProfileFrameOverlay';
import { bannerStyleBackground, visibleBannerStyle, type BannerStyle } from '@/lib/profile-banner-style';
import styles from './ProfileEditorLivePreview.module.css';

export type ProfileEditorSection = 'profile' | 'avatar' | 'banner' | 'frame' | 'style';
type Props = {
  expanded?: boolean; username: string; bio: string; avatarUrl: string; bannerUrl: string | null;
  bannerColor: string; bannerStyle: BannerStyle; premiumActive: boolean;
  frameKey?: string | null;
  previewPremiumFill?: boolean;
  onNavigate: (section: ProfileEditorSection) => void;
};
export default function ProfileEditorLivePreview({
  expanded=false, username, bio, avatarUrl, bannerUrl, bannerColor, bannerStyle,
  premiumActive, frameKey, previewPremiumFill=false, onNavigate,
}: Props) {
  const background = bannerStyleBackground(bannerColor, previewPremiumFill ? bannerStyle : visibleBannerStyle(bannerStyle, premiumActive));
  return (
    <section className={`${styles.preview} ${expanded ? styles.expanded : ""}`} aria-label="Живой предпросмотр профиля">
      <button type="button" className={styles.banner}
        style={{ background }} onClick={() => onNavigate('banner')} aria-label="Настроить баннер">
        {bannerUrl && <img src={bannerUrl} alt="" />}
        <span className={styles.shade} aria-hidden="true" />
        <span className={styles.editBanner}>✎ Баннер</span>
      </button>
      <div className={styles.identity}>
        <button type="button" className={styles.avatar} onClick={() => onNavigate('avatar')} aria-label="Настроить аватар">
          <img src={avatarUrl} alt="" />
          <ProfileFrameOverlay frameKey={frameKey ?? null} premium={premiumActive} />
          <span className={styles.editAvatar} aria-hidden="true">✎</span>
        </button>
        <div className={styles.copy}>
          <button className={styles.name} type="button" onClick={() => onNavigate('profile')}
            title={username.trim() || 'Пользователь'}>{username.trim() || 'Пользователь'} <span>✎</span></button>
          <p className={styles.bio} title={bio}>{bio.trim() || 'Добавь пару слов о себе…'}</p>
        </div>
      </div>
    </section>
  );
}

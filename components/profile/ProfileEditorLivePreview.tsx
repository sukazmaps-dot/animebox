'use client';
import { useId, useState, type CSSProperties } from 'react';
import { premiumStudioCssVariables, type PremiumStudioSettings } from '@/lib/premium-studio';
import ProfileFrameOverlay from '@/components/profile/ProfileFrameOverlay';
import { bannerStyleBackground, visibleBannerStyle, type BannerStyle } from '@/lib/profile-banner-style';
import styles from './ProfileEditorLivePreview.module.css';

// Preview targets include legacy deep-link anchors, independently of the four navigation tabs.
export type ProfileEditorSection = 'profile' | 'avatar' | 'banner' | 'frame' | 'style';
type Props = {
  full?: boolean; createdAt?: string; appearance?: PremiumStudioSettings | null;
  expanded?: boolean; username: string; bio: string; avatarUrl: string; bannerUrl: string | null;
  bannerColor: string; bannerStyle: BannerStyle; premiumActive: boolean;
  frameKey?: string | null;
  previewPremiumFill?: boolean;
  onNavigate: (section: ProfileEditorSection) => void;
  onUsernameChange?: (value: string) => void;
  onBioChange?: (value: string) => void;
};
export default function ProfileEditorLivePreview({
  full=false, createdAt, appearance, expanded=false, username, bio, avatarUrl, bannerUrl, bannerColor, bannerStyle,
  premiumActive, frameKey, previewPremiumFill=false, onNavigate, onUsernameChange, onBioChange,
}: Props) {
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarMenuId = useId();
  const [editingName, setEditingName] = useState(false);
  const [editingBio, setEditingBio] = useState(false);
  const background = bannerStyleBackground(bannerColor, previewPremiumFill ? bannerStyle : visibleBannerStyle(bannerStyle, premiumActive));
  const joined = createdAt && Number.isFinite(Date.parse(createdAt))
    ? new Intl.DateTimeFormat('ru-RU', { day:'numeric', month:'long', year:'numeric', timeZone:'UTC' }).format(new Date(createdAt)) : null;
  const theme = appearance ? {
    ...premiumStudioCssVariables(appearance), '--preview-surface':appearance.primaryColor,
    '--preview-text':'var(--ab-premium-text)', '--preview-muted':'var(--ab-premium-text)',
  } as CSSProperties : undefined;
  return (
    <section className={`${styles.preview} ${expanded ? styles.expanded : ""}`} aria-label="Живой предпросмотр профиля" data-full={full || expanded || undefined} style={theme}>
      <button type="button" className={styles.banner}
        style={{ background }} onClick={() => onNavigate('banner')} aria-controls="profile-editor-banner" aria-label="Настроить баннер">
        {bannerUrl && <img src={bannerUrl} alt="" />}
        <span className={styles.shade} aria-hidden="true" />
        <span className={styles.editBanner}>✎ Баннер</span>
      </button>
      <div className={styles.identity}>
        <button type="button" className={styles.avatar} data-has-frame={frameKey ? 'true' : 'false'} onClick={() => setAvatarMenuOpen(open => !open)} aria-haspopup="menu" aria-expanded={avatarMenuOpen} aria-controls={avatarMenuId} aria-label="Настроить аватар">
          <span className={styles.avatarImage}><img src={avatarUrl} alt="" /></span>
          <ProfileFrameOverlay frameKey={frameKey ?? null} premium={premiumActive} className={styles.avatarFrame} />
          <span className={styles.editAvatar} aria-hidden="true">✎</span>
        </button>
        {avatarMenuOpen && <div className={styles.avatarMenu} id={avatarMenuId} role="menu"
          onKeyDown={event => {if(event.key==='Escape'){event.stopPropagation();setAvatarMenuOpen(false);}}}
          onBlur={event => {if(!event.currentTarget.contains(event.relatedTarget))setAvatarMenuOpen(false);}}>
          <button type="button" role="menuitem" onClick={() => {setAvatarMenuOpen(false);onNavigate('avatar');}}>Загрузить аватар</button>
          <button type="button" role="menuitem" onClick={() => {setAvatarMenuOpen(false);onNavigate('frame');}}>Рамка аватара</button>
        </div>}
        <div className={styles.copy}>
          {editingName && onUsernameChange ? <input
            className={styles.inlineName} aria-label="Имя пользователя"
            value={username} maxLength={24} onChange={event => onUsernameChange(event.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={event => {if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();}}
          /> : <button className={styles.name} type="button"
            onClick={() => onUsernameChange ? setEditingName(true) : onNavigate('profile')}
            aria-controls="profile-editor-name" title={username.trim() || 'Пользователь'}>{username.trim() || 'Пользователь'} <span>✎</span></button>}
          <p className={styles.bio} title={bio}>{bio.trim() || 'Добавь пару слов о себе…'}</p>
        </div>
      </div>
      {(full || expanded) && <div className={styles.details}>
        <div className={styles.badges}>
          <span>AnimeBox</span>{premiumActive && <span>✦ Premium</span>}
        </div>
        <section className={styles.about}><h3>Обо мне</h3>
          {editingBio && onBioChange ? <textarea className={styles.inlineBio} aria-label="Обо мне"
            value={bio} maxLength={300} rows={4} onChange={event => onBioChange(event.target.value)}
            onBlur={() => setEditingBio(false)}
            onKeyDown={event => {if (event.key === 'Escape') event.currentTarget.blur();}}
          /> : <button className={styles.aboutEdit} type="button"
            onClick={() => onBioChange ? setEditingBio(true) : onNavigate('profile')}
            aria-controls="profile-editor-name"><p>{bio.trim() || 'Расскажи о любимых историях и о себе.'}</p><span>✎</span></button>}
        </section>
        {joined && <section className={styles.about}><h3>В AnimeBox с</h3><p>{joined}</p></section>}
      </div>}
    </section>
  );
}

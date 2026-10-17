'use client';

type Destination = 'profile' | 'style' | 'showcase' | 'rewards';
type Props = {
  activeTab: Destination;
  dirty?: Record<string, boolean>;
  onNavigate: (destination: Destination) => void;
};

/** Secondary destinations stay available without competing with profile editing. */
export default function ProfileEditorNavigation({ activeTab, dirty = {}, onNavigate }: Props) {
  const destinations = [['style', 'Оформление'], ['showcase', 'Витрина'], ['rewards', 'Награды']] as const;
  const secondaryDirty = destinations.some(([key]) => dirty[key]);
  return (
    <nav className="profile-editor-v13__tabs profile-editor-v18__rail" aria-label="Разделы редактора профиля">
      <button type="button" data-section="profile" data-dirty={dirty.profile || undefined}
        className={activeTab === 'profile' ? 'is-active' : ''}
        aria-current={activeTab === 'profile' ? 'page' : undefined} onClick={() => onNavigate('profile')}>
        <span>Мой профиль</span>
      </button>
      <details className="profile-editor-v34__more" open={activeTab !== 'profile' || undefined}
        onKeyDown={event => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
            event.stopPropagation();
          }
        }}>
        <summary data-dirty={secondaryDirty || undefined}>Дополнительно <span aria-hidden="true">⌄</span></summary>
        <div className="profile-editor-v34__destinations">
          {destinations.map(([key, label]) => (
            <button key={key} type="button" data-section={key} data-dirty={dirty[key] || undefined}
              className={activeTab === key ? 'is-active' : ''}
              aria-current={activeTab === key ? 'page' : undefined} onClick={() => onNavigate(key)}>
              <span>{label}</span>
            </button>
          ))}
        </div>
      </details>
    </nav>
  );
}

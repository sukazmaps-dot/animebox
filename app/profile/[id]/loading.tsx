import AnimeBoxLoader from '@/components/ui/AnimeBoxLoader';

export default function PublicProfileLoading() {
  return (
    <main className="profile-v2">
      <div className="profile-v2__loading">
        <AnimeBoxLoader label="Загружаем профиль…" size={52} />
      </div>
    </main>
  );
}

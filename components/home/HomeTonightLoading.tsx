import styles from './HomeTonightPick.module.css';

/** Cheap shared placeholder: importing it does not pull in poster/choice code. */
export default function HomeTonightLoading({ mood }: { mood?: string }) {
  return (
    <div className={styles.loading} role="status" aria-live="polite" aria-busy="true" data-home-tonight="loading" data-tonight-mood={mood}>
      <span className={styles.placeholder} aria-hidden="true" />
      <p>Подбираем вариант на сегодня…</p>
    </div>
  );
}

import styles from './GlobalChatV11Client.module.css';

export default function ChatLoadingShell() {
  return (
    <div className={styles.shell}>
      <section className={styles.chatPanel} aria-busy="true" aria-label="Общий чат">
        <header className={styles.header}>
          <div><span className={styles.eyebrow}>ANIMEBOX COMMUNITY</span><h1>Общий чат</h1><p role="status">Загружаем последние сообщения…</p></div>
        </header>
        <div className={styles.viewport} aria-hidden="true">
          <div className={styles.messages}>
            {[0, 1, 2, 3].map(index => <div key={index} className="skeleton" style={{height: '4rem', borderRadius: '1rem', marginBottom: '1rem'}} />)}
          </div>
        </div>
      </section>
    </div>
  );
}

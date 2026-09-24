'use client';

import { FormEvent, useState } from 'react';

import styles from './CopyrightReportForm.module.css';

type FormState = {
  claimantName: string;
  claimantCompany: string;
  claimantEmail: string;
  claimantRole: 'rights_holder' | 'authorized_agent' | 'other';
  workTitle: string;
  urls: string;
  rightsDescription: string;
  authorityStatement: string;
  signature: string;
  goodFaith: boolean;
  website: string;
};

const INITIAL: FormState = {
  claimantName: '',
  claimantCompany: '',
  claimantEmail: '',
  claimantRole: 'rights_holder',
  workTitle: '',
  urls: '',
  rightsDescription: '',
  authorityStatement: '',
  signature: '',
  goodFaith: false,
  website: '',
};

export default function CopyrightReportForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [caseNumber, setCaseNumber] = useState('');

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setError('');
    setCaseNumber('');

    try {
      const response = await fetch('/api/copyright/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          ...form,
          urls: form.urls
            .split(/\r?\n/)
            .map((value) => value.trim())
            .filter(Boolean),
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        caseNumber?: string;
      };

      if (!response.ok || !payload.ok || !payload.caseNumber) {
        throw new Error(payload.error || 'Не удалось отправить обращение.');
      }

      setCaseNumber(payload.caseNumber);
      setForm(INITIAL);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Не удалось отправить обращение.',
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <div className={styles.honeypot} aria-hidden="true">
        <label>
          Website
          <input
            tabIndex={-1}
            autoComplete="off"
            value={form.website}
            onChange={(event) => update('website', event.target.value)}
          />
        </label>
      </div>

      <div className={styles.grid}>
        <label>
          <span>Имя заявителя *</span>
          <input
            required
            maxLength={140}
            value={form.claimantName}
            onChange={(event) => update('claimantName', event.target.value)}
          />
        </label>

        <label>
          <span>Компания / организация</span>
          <input
            maxLength={180}
            value={form.claimantCompany}
            onChange={(event) => update('claimantCompany', event.target.value)}
          />
        </label>

        <label>
          <span>Контактный email *</span>
          <input
            required
            type="email"
            maxLength={254}
            value={form.claimantEmail}
            onChange={(event) => update('claimantEmail', event.target.value)}
          />
        </label>

        <label>
          <span>Роль *</span>
          <select
            value={form.claimantRole}
            onChange={(event) =>
              update(
                'claimantRole',
                event.target.value as FormState['claimantRole'],
              )
            }
          >
            <option value="rights_holder">Правообладатель</option>
            <option value="authorized_agent">Уполномоченный представитель</option>
            <option value="other">Другое основание</option>
          </select>
        </label>
      </div>

      <label>
        <span>Произведение / тайтл *</span>
        <input
          required
          maxLength={240}
          placeholder="Название произведения"
          value={form.workTitle}
          onChange={(event) => update('workTitle', event.target.value)}
        />
      </label>

      <label>
        <span>Точные URL на AnimeBox *</span>
        <textarea
          required
          rows={4}
          placeholder={'https://youranimebox.com/anime/...\nhttps://youranimebox.com/anime/.../episode/1'}
          value={form.urls}
          onChange={(event) => update('urls', event.target.value)}
        />
        <small>До 10 адресов, по одному в строке.</small>
      </label>

      <label>
        <span>Описание заявленных прав и спорного материала *</span>
        <textarea
          required
          minLength={30}
          maxLength={5_000}
          rows={6}
          value={form.rightsDescription}
          onChange={(event) => update('rightsDescription', event.target.value)}
        />
      </label>

      <label>
        <span>Основание полномочий *</span>
        <textarea
          required
          minLength={20}
          maxLength={3_000}
          rows={4}
          placeholder="Например: правообладатель, лицензиат или представитель по поручению правообладателя."
          value={form.authorityStatement}
          onChange={(event) => update('authorityStatement', event.target.value)}
        />
      </label>

      <label>
        <span>Имя / подпись заявителя *</span>
        <input
          required
          maxLength={180}
          value={form.signature}
          onChange={(event) => update('signature', event.target.value)}
        />
      </label>

      <label className={styles.check}>
        <input
          required
          type="checkbox"
          checked={form.goodFaith}
          onChange={(event) => update('goodFaith', event.target.checked)}
        />
        <span>
          Подтверждаю, что обращение направляется добросовестно и указанные
          сведения, насколько мне известно, являются точными.
        </span>
      </label>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {caseNumber && (
        <p className={styles.success} role="status">
          Обращение зарегистрировано. Номер дела: <strong>{caseNumber}</strong>
        </p>
      )}

      <button type="submit" disabled={sending}>
        {sending ? 'Отправляем…' : 'Отправить обращение'}
      </button>
    </form>
  );
}

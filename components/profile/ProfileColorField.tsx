'use client';

import { useId, useState } from 'react';
import styles from './ProfileColorField.module.css';

const PRESETS = ['#081426', '#181326', '#F4F7FF', '#6F8DFF', '#DB87AF', '#62C4AA'];
export function normalizeProfileHex(value: string): string | null {
  const text = value.trim().replace(/^#/, '');
  if (/^[0-9a-f]{6}$/i.test(text)) return `#${text.toUpperCase()}`;
  if (/^[0-9a-f]{3}$/i.test(text)) return '#' + [...text].map(char => char + char).join('').toUpperCase();
  return null;
}

export default function ProfileColorField({ label, value, hint, badge, onChange }: {
  label: string; value: string; hint: string; badge?: string; onChange: (value: string) => void;
}) {
  const id = useId();
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const text = editing ?? value;
  return <div className={styles.field}>
    <div className={styles.labelRow}><label htmlFor={id}>{label}</label>{badge && <small>{badge}</small>}</div>
    <div className={styles.controls}>
      <input className={styles.swatch} type="color" value={value} name={`${id}-color`}
        aria-label={`${label}: выбрать цвет`} onChange={e => { onChange(e.target.value.toUpperCase()); setEditing(null); }} />
      <input id={id} name={id} className={styles.hex} type="text" inputMode="text" spellCheck={false}
        value={text} maxLength={7} aria-describedby={`${id}-hint`} aria-invalid={!!error}
        onChange={e => {
          setEditing(e.target.value); setError('');
          const hex = normalizeProfileHex(e.target.value);
          if (hex && e.target.value.replace('#', '').length === 6) onChange(hex);
        }}
        onBlur={() => {
          const hex = normalizeProfileHex(text);
          if (hex) {onChange(hex);setEditing(null);setError('');}
          else setError('Введи 3 или 6 HEX-символов');
        }} />
      <button type="button" onClick={async () => {
        const Ctor = (window as Window & {EyeDropper?: new () => {open: () => Promise<{sRGBHex: string}>}}).EyeDropper;
        if (!Ctor) {setError('Пипетка недоступна в этом браузере');return;}
        try {const result = await new Ctor().open();onChange(result.sRGBHex.toUpperCase());setEditing(null);setError('');}
        catch { /* Closing the system picker leaves the draft unchanged. */ }
      }} aria-label={`${label}: пипетка`} title="Взять цвет с экрана">⌖</button>
    </div>
    <small id={`${id}-hint`}>{hint}</small>
    <div className={styles.presets} aria-label={`${label}: готовые цвета`}>
      {PRESETS.map(color => <button type="button" key={color} style={{background:color}}
        aria-label={`${label}: ${color}`} aria-pressed={value.toUpperCase() === color}
        onClick={() => {onChange(color);setEditing(null);setError('');}} />)}
    </div>
    {error && <small role="alert">{error}</small>}
  </div>;
}

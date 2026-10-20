'use client';

import { useId, useRef, useState } from 'react';
import FloatingMenu from './FloatingMenu';
import styles from './ChoiceSelect.module.css';

export default function ChoiceSelect({ label, value, options, onChange }: {
  label: string; value: string; options: { id: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  return <div className={styles.root}>
    <button ref={trigger} type="button" className={styles.trigger} aria-label={label}
      aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? id : undefined}
      onClick={() => setOpen(v => !v)}
      onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key)) { event.preventDefault(); setOpen(true); } }}>
      <span><small>{label}</small><strong>{options.find(option => option.id === value)?.label || 'Выбрать'}</strong></span>
      <span aria-hidden="true">⌄</span>
    </button>
    {open && <FloatingMenu anchor={trigger} label={label} onClose={() => setOpen(false)}>
      <div id={id} role="listbox" aria-label={label}>
        {options.map(option => <button key={option.id} type="button" role="option"
          aria-selected={option.id === value} data-label={option.label}
          className={styles.option} onClick={() => { onChange(option.id); setOpen(false); trigger.current?.focus({ preventScroll: true }); }}>
          <span>{option.label}</span><span aria-hidden="true">{option.id === value ? '✓' : ''}</span>
        </button>)}
      </div>
    </FloatingMenu>}
  </div>;
}

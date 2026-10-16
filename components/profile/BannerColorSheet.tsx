'use client';
import { useCallback, useEffect, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { validBannerColor } from '@/lib/profile-banner-style';
import styles from './BannerColorSheet.module.css';

type HSV = { h: number; s: number; v: number };
type EyeDropperAPI = { open: () => Promise<{ sRGBHex: string }> };
type Props = {
  color: string;
  onPreview: (color: string) => void;
  onCancel: () => void;
  onAccept: () => void;
};
function clamp(value: number, min=0, max=1) { return Math.max(min, Math.min(max,value)); }
function hexToHsv(hex: string): HSV {
  const value = validBannerColor(hex) ? hex : '#70618c';
  const [r,g,b]=[1,3,5].map(i=>parseInt(value.slice(i,i+2),16)/255);
  const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  let h=0;
  if(delta) {
    if(max===r) h=((g-b)/delta)%6;
    else if(max===g) h=(b-r)/delta+2;
    else h=(r-g)/delta+4;
    h=(h*60+360)%360;
  }
  return {h,s:max===0?0:delta/max,v:max};
}
function hsvToHex({h,s,v}:HSV):string {
  const c=v*s,x=c*(1-Math.abs((h/60)%2-1)),m=v-c;
  const row=Math.floor(h/60)%6;
  const channels: [number,number,number][]=[[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]];
  return '#'+channels[row].map(val=>Math.round((val+m)*255).toString(16).padStart(2,'0')).join('');
}
function vibrate() {
  try {
    const webapp=(window as Window & {Telegram?:{WebApp?:{HapticFeedback?:{selectionChanged?:()=>void}}}}).Telegram?.WebApp;
    if(webapp?.HapticFeedback?.selectionChanged) webapp.HapticFeedback.selectionChanged();
    else navigator.vibrate?.(8);
  } catch { /* Optional haptic, not available in every browser. */ }
}
export default function BannerColorSheet({color,onPreview,onCancel,onAccept}:Props) {
  const [hsv,setHsv]=useState<HSV>(()=>hexToHsv(color));
  const [text,setText]=useState(color);
  const [error,setError]=useState('');
  const [recent,setRecent]=useState<string[]>([]);
  const send = useCallback((newValue: HSV) => {
    setHsv(newValue);
    const hex=hsvToHex(newValue);
    setText(hex);setError('');
    onPreview(hex);
  },[onPreview]);
  useEffect(()=>{
    const keydown=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){e.preventDefault();onCancel();}
    };
    document.addEventListener('keydown',keydown);
    return ()=>document.removeEventListener('keydown',keydown);
  },[onCancel]);
  const updateSV=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const rect=event.currentTarget.getBoundingClientRect();
    send({ ...hsv, s:clamp((event.clientX-rect.left)/rect.width),v:1-clamp((event.clientY-rect.top)/rect.height)});
  };
  const accept=()=>{
    if(!validBannerColor(text)){setError('Цвет должен быть в формате #RRGGBB');return;}
    onPreview(text);
    try {
      const previous=JSON.parse(localStorage.getItem('ab-banner-recent-colors')||'[]') as unknown;
      const safe=Array.isArray(previous)?previous.filter(validBannerColor):[];
      localStorage.setItem('ab-banner-recent-colors',JSON.stringify([text.toLowerCase(),...safe.filter(x=>x.toLowerCase()!==text.toLowerCase())].slice(0,8)));
    }catch { /* Disabled storage is fine. */ }
    vibrate();onAccept();
  };
  const openHistory=()=>{
    try {
      const json=JSON.parse(localStorage.getItem('ab-banner-recent-colors')||'[]') as unknown;
      setRecent(Array.isArray(json)?json.filter(validBannerColor).slice(0,8):[]);
    }catch {setRecent([]);}
  };
  const hue='hsl('+hsv.h+' 100% 50%)';
  return createPortal(
    <div className={styles.backdrop} onPointerDown={event=>{if(event.target===event.currentTarget)onCancel();}}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-labelledby="banner-color-sheet-title">
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.header}>
          <h2 id="banner-color-sheet-title">Свой цвет баннера</h2>
          <button type="button" className={styles.iconButton} aria-label="Закрыть" onClick={onCancel}>×</button>
        </div>
        <div className={styles.svArea} role="group" aria-label="Насыщенность и яркость" style={{backgroundColor:hue}}
          onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);updateSV(e);vibrate();}}
          onPointerMove={e=>{if(e.buttons)updateSV(e);}}>
          <div className={styles.whiteLayer} /><div className={styles.blackLayer} />
          <span className={styles.pointer} style={{left:(hsv.s*100)+'%',top:((1-hsv.v)*100)+'%'}} />
        </div>
        <label className={styles.sliderLabel}>
          <span>Оттенок</span>
          <input type="range" min="0" max="359" step="1" value={Math.round(hsv.h)}
            style={{background:'linear-gradient(90deg,red,#ff0,#0f0,#0ff,#00f,#f0f,red)'}}
            aria-label="Оттенок цвета" onChange={e=>send({...hsv,h:Number(e.target.value)})} />
        </label>
        <div className={styles.fieldRow}>
          <label><span>HEX</span>
            <input autoFocus spellCheck={false} maxLength={7} inputMode="text" value={text}
              aria-invalid={!!error} onChange={e=>{setText(e.target.value);setError('');}}
              onBlur={()=>{if(validBannerColor(text))send(hexToHsv(text));}} />
          </label>
          <button type="button" className={styles.dropper} title="Пипетка — если поддерживается" aria-label="Взять цвет с экрана"
            onClick={async()=>{
              try {
                const Ctor=(window as Window & {EyeDropper?:new()=>EyeDropperAPI}).EyeDropper;
                if(!Ctor){setError('Пипетка недоступна в этом браузере');return;}
                const response=await new Ctor().open();
                if(validBannerColor(response.sRGBHex))send(hexToHsv(response.sRGBHex));
              } catch { /* Cancelling native EyeDropper is fine. */ }
            }}>✎</button>
          <span className={styles.preview} style={{backgroundColor:validBannerColor(text)?text:color}} />
        </div>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.recent}>
          <button type="button" onClick={openHistory}>Недавние цвета ▾</button>
          {recent.map(item=><button type="button" key={item} className={styles.recentSwatch}
            aria-label={item} style={{background:item}} onClick={()=>{send(hexToHsv(item));vibrate();}} />)}
        </div>
        <div className={styles.actions}>
          <button type="button" onClick={onCancel}>Отмена</button>
          <button type="button" className={styles.primary} onClick={accept}>Применить</button>
        </div>
      </div>
    </div>,
    document.body
  );
}

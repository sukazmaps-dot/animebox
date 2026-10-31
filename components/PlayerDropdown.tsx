'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { calculatePlayerDropdownPosition, type PlayerDropdownPosition } from '@/lib/player-dropdown-position';

type DropdownOption = { id:string; label:string; meta?:string };
type PlayerDropdownProps = {
  label:string; value:string; options:DropdownOption[]; onChange:(id:string)=>void;
  icon?:ReactNode; align?:'left'|'right'; themeStyle?:CSSProperties;
};

const MENU_MAX_HEIGHT=374;
const MENU_HEADER_HEIGHT=58;

export default function PlayerDropdown({label,value,options,onChange,icon,align='left',themeStyle}:PlayerDropdownProps) {
  const [open,setOpen]=useState(false);
  const [portalRoot,setPortalRoot]=useState<HTMLElement|null>(null);
  const [position,setPosition]=useState<PlayerDropdownPosition>({
    top:8,left:8,width:240,maxHeight:MENU_MAX_HEIGHT,placement:'bottom',
  });
  const rootRef=useRef<HTMLDivElement|null>(null);
  const triggerRef=useRef<HTMLButtonElement|null>(null);
  const menuRef=useRef<HTMLDivElement|null>(null);
  const menuId=useId();
  const selected=options.find(option=>option.id===value);

  const updatePosition=useCallback(()=>{
    const rect=triggerRef.current?.getBoundingClientRect();
    if(!rect)return;
    setPosition(calculatePlayerDropdownPosition({
      trigger:rect,
      menuHeight:Math.min(menuRef.current?.scrollHeight || 64+options.length*44,MENU_MAX_HEIGHT),
      viewportWidth:window.innerWidth,
      viewportHeight:window.innerHeight,
      align,
    }));
  },[align,options.length]);

  const openMenu=()=>{
    if(open){setOpen(false);return;}
    const rect=triggerRef.current?.getBoundingClientRect();
    if(rect){
      setPosition(calculatePlayerDropdownPosition({
        trigger:rect,menuHeight:Math.min(64+options.length*44,MENU_MAX_HEIGHT),
        viewportWidth:window.innerWidth,viewportHeight:window.innerHeight,align,
      }));
    }
    const fullscreenRoot=document.fullscreenElement;
    setPortalRoot(fullscreenRoot instanceof HTMLElement?fullscreenRoot:document.body);
    setOpen(true);
  };

  useEffect(()=>{
    if(!open)return;
    let frame=0;
    const reposition=()=>{
      if(frame)window.cancelAnimationFrame(frame);
      frame=window.requestAnimationFrame(()=>{frame=0;updatePosition();});
    };
    const onPointerDown=(event:PointerEvent)=>{
      const target=event.target;
      if(!(target instanceof Node))return;
      if(rootRef.current?.contains(target)||menuRef.current?.contains(target))return;
      setOpen(false);
    };
    const onKeyDown=(event:KeyboardEvent)=>{
      if(event.key!=='Escape')return;
      setOpen(false);
      triggerRef.current?.focus({preventScroll:true});
    };
    const onFullscreenChange=()=>{
      const fullscreenRoot=document.fullscreenElement;
      setPortalRoot(fullscreenRoot instanceof HTMLElement?fullscreenRoot:document.body);
      reposition();
    };
    updatePosition();
    window.addEventListener('resize',reposition);
    window.addEventListener('scroll',reposition,true);
    window.visualViewport?.addEventListener('resize',reposition);
    window.visualViewport?.addEventListener('scroll',reposition);
    document.addEventListener('pointerdown',onPointerDown);
    document.addEventListener('keydown',onKeyDown);
    document.addEventListener('fullscreenchange',onFullscreenChange);
    return ()=>{
      if(frame)window.cancelAnimationFrame(frame);
      window.removeEventListener('resize',reposition);
      window.removeEventListener('scroll',reposition,true);
      window.visualViewport?.removeEventListener('resize',reposition);
      window.visualViewport?.removeEventListener('scroll',reposition);
      document.removeEventListener('pointerdown',onPointerDown);
      document.removeEventListener('keydown',onKeyDown);
      document.removeEventListener('fullscreenchange',onFullscreenChange);
    };
  },[open,updatePosition]);

  const menuStyle:CSSProperties={
    ...themeStyle,
    position:'fixed',top:position.top,left:position.left,width:position.width,
    maxHeight:position.maxHeight,zIndex:11020,overflow:'hidden',
  };
  const listStyle:CSSProperties={
    maxHeight:Math.max(64,position.maxHeight-MENU_HEADER_HEIGHT),overflowY:'auto',
  };
  const menu=(
    <div ref={menuRef} id={menuId} role="listbox" aria-label={label}
      data-player-dropdown-menu data-placement={position.placement}
      className={`player-dropdown-menu ${themeStyle?'is-premium-themed':''} fixed z-[11020] overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--ab-ui-accent)_15%,transparent)] bg-[var(--ab-ui-surface)]/[0.98] shadow-[0_24px_70px_rgba(0,0,0,0.52),0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl`}
      style={menuStyle}>
      <div className="border-b border-white/[0.05] px-3.5 py-3">
        <p className="text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/30">{label}</p>
      </div>
      <div data-player-dropdown-options
        className="overflow-y-auto p-2 [scrollbar-color:color-mix(in_srgb,_var(--ab-ui-accent)_34%,_transparent)_transparent] [scrollbar-width:thin]"
        style={listStyle}>
        {options.map(option=>{
          const active=option.id===value;
          return <button key={option.id} type="button" role="option" aria-selected={active}
            onClick={()=>{onChange(option.id);setOpen(false);triggerRef.current?.focus({preventScroll:true});}}
            className={`premium-player-dropdown-option ${active?'is-active':''} flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${active
              ?'bg-gradient-to-r from-[var(--ab-ui-primary)]/[0.16] to-[var(--ab-ui-primary)]/[0.08] text-white ring-1 ring-inset ring-violet-400/15'
              :'text-white/60 hover:bg-white/[0.045] hover:text-white'}`}>
            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] ${active
              ?'border-[color-mix(in_srgb,var(--ab-ui-accent)_45%,transparent)] bg-[color-mix(in_srgb,var(--ab-ui-selected)_20%,transparent)] text-[var(--ab-ui-accent)]'
              :'border-white/[0.08] bg-white/[0.025] text-transparent'}`}>✓</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-bold">{option.label}</span>
              {option.meta&&<span className="mt-0.5 block truncate text-[10px] text-white/28">{option.meta}</span>}
            </span>
          </button>;
        })}
      </div>
    </div>
  );

  return <div ref={rootRef} className="premium-player-dropdown relative min-w-0">
    <button ref={triggerRef} type="button" onClick={openMenu} aria-expanded={open}
      aria-controls={menuId} data-player-dropdown-trigger
      className={`premium-player-dropdown-trigger ${open?'is-open':''} group flex min-h-11 w-full items-center gap-3 rounded-2xl border px-3.5 text-left transition duration-200 sm:min-w-[210px] ${open
        ?'border-[color-mix(in_srgb,var(--ab-ui-accent)_35%,transparent)] bg-[var(--ab-ui-primary)]/[0.08] shadow-[0_0_0_4px_color-mix(in_srgb,_var(--ab-ui-accent)_7%,_transparent)]'
        :'border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12] hover:bg-white/[0.045]'}`}>
      {icon&&<span className="premium-player-control-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/[0.06] bg-black/20 text-[var(--ab-ui-accent)]">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block text-[9px] font-extrabold uppercase tracking-[0.16em] text-white/30">{label}</span>
        <span className="mt-0.5 block truncate text-xs font-bold text-white/85">{selected?.label||'Выбрать'}</span>
      </span>
      <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"
        className={`h-4 w-4 shrink-0 text-white/35 transition-transform duration-200 ${open?'rotate-180':''}`}>
        <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
    <select aria-label={label} value={value} onChange={event=>{onChange(event.target.value);setOpen(false);}}
      onFocus={()=>setOpen(false)} className="absolute inset-0 z-[60] h-11 w-full cursor-pointer opacity-0 sm:hidden"
      style={{colorScheme:'dark'}}>
      {options.map(option=><option key={option.id} value={option.id} className="bg-[var(--ab-ui-surface)] text-white">{option.label}</option>)}
    </select>
    {open&&portalRoot?createPortal(menu,portalRoot):null}
  </div>;
}

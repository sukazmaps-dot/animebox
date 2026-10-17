'use client';
import { useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;
/** Keep fixed editor geometry outside transformed or offset route containers. */
export default function ProfileEditorViewport({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot);
  return mounted ? createPortal(children, document.body) : null;
}

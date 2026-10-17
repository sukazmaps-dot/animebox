export type ProfileEditorAnchor = 'name' | 'avatar' | 'banner' | 'frame';
export function profileEditorAnchor(value?: string | null): ProfileEditorAnchor {
  return value === 'avatar' || value === 'banner' || value === 'frame' ? value : 'name';
}


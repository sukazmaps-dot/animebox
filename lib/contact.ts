export const SUPPORT_EMAIL = 'support@youranimebox.com';
export const COPYRIGHT_EMAIL = 'copyright@youranimebox.com';

export const SUPPORT_MAILTO = `mailto:${SUPPORT_EMAIL}`;

export function buildSupportMailto(subject?: string) {
  if (!subject) return SUPPORT_MAILTO;

  const params = new URLSearchParams({ subject });
  return `${SUPPORT_MAILTO}?${params.toString()}`;
}

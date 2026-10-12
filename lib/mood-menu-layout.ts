export type MoodMenuBounds = { top: number; bottom: number; width: number; height: number };

/** Hidden navigation has zero geometry and cannot constrain a desktop popup. */
export function moodMenuLayout({ trigger, viewportTop, viewportBottom, navigation, desiredHeight }: {
  trigger: Pick<MoodMenuBounds, 'top' | 'bottom'>;
  viewportTop: number;
  viewportBottom: number;
  navigation: MoodMenuBounds[];
  desiredHeight: number;
}) {
  const gap = 9;
  const edge = 12;
  const visibleNavigation = navigation.filter((rect) => rect.width > 0 && rect.height > 0 &&
    rect.bottom > viewportTop && rect.top < viewportBottom && rect.top >= trigger.bottom);
  const bottom = Math.min(viewportBottom, ...visibleNavigation.map((rect) => rect.top));
  const below = Math.max(0, bottom - trigger.bottom - gap - edge);
  const above = Math.max(0, trigger.top - viewportTop - gap - edge);
  const needed = Math.min(560, Math.max(44, desiredHeight));
  const opensUp = below < needed && above > below;
  return { opensUp, maxHeight: Math.min(needed, Math.max(0, opensUp ? above : below)) };
}

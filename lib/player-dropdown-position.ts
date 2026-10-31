export type PlayerDropdownAlign = 'left' | 'right';
export type PlayerDropdownRect = { top:number; bottom:number; left:number; right:number; width:number };
export type PlayerDropdownPosition = { top:number; left:number; width:number; maxHeight:number; placement:'top'|'bottom' };

export function calculatePlayerDropdownPosition({
  trigger, menuHeight, viewportWidth, viewportHeight, align='left', gap=10, gutter=8,
}: {
  trigger:PlayerDropdownRect; menuHeight:number; viewportWidth:number; viewportHeight:number;
  align?:PlayerDropdownAlign; gap?:number; gutter?:number;
}): PlayerDropdownPosition {
  const width = Math.min(Math.max(trigger.width,240),Math.max(1,viewportWidth-gutter*2));
  const maxLeft = Math.max(0,viewportWidth-width);
  const preferredLeft = align==='right' ? trigger.right-width : trigger.left;
  const left = Math.max(0,Math.min(preferredLeft,maxLeft));
  const desiredHeight = Math.max(1,Math.min(menuHeight,374));
  const above = Math.max(0,trigger.top-gap-gutter);
  const below = Math.max(0,viewportHeight-trigger.bottom-gap-gutter);
  const placement = below>=desiredHeight || below>=above ? 'bottom' : 'top';
  const available = placement==='top' ? above : below;
  const maxHeight = Math.max(1,Math.min(desiredHeight,available));
  const preferredTop = placement==='top' ? trigger.top-gap-maxHeight : trigger.bottom+gap;
  const top = Math.max(0,Math.min(preferredTop,Math.max(0,viewportHeight-maxHeight)));
  return {top,left,width,maxHeight,placement};
}

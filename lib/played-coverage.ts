/** Merge actually played media ranges. Seeking and replaying do not add coverage. */
export function mergePlayedRanges(ranges: [number, number][], start: number, end: number): [number, number][] {
  if (![start, end].every(Number.isFinite) || start < 0 || end <= start) return ranges;
  const sorted = [...ranges, [start, end] as [number, number]].sort((a, b) => a[0] - b[0]);
  const result: [number, number][] = [];
  for (const range of sorted) {
    const last = result[result.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else result.push([...range]);
  }
  return result;
}
export function coveredSeconds(ranges: [number, number][]) {
  return ranges.reduce((sum, [start, end]) => sum + end - start, 0);
}

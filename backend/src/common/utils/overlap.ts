export type TimeRange = {
  startAt: Date;
  endAt: Date;
};

export function rangesOverlap(existing: TimeRange, candidate: TimeRange): boolean {
  return existing.startAt < candidate.endAt && existing.endAt > candidate.startAt;
}

export function durationMinutes(startAt: Date, endAt: Date): number {
  return Math.floor((endAt.getTime() - startAt.getTime()) / 60000);
}


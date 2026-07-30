export const GRID_SNAP_MINUTES = 30;
export const DAY_START_HOUR = 0;
export const DAY_END_HOUR = 24;
export const VIEW_WINDOW_MINUTES = 24 * 60;

export function snapMinutes(minutes: number, snap = GRID_SNAP_MINUTES) {
  return Math.round(minutes / snap) * snap;
}

export function clampMinutes(minutes: number) {
  return Math.min(VIEW_WINDOW_MINUTES, Math.max(0, minutes));
}

export function minutesToTime(minutesFromGridStart: number, windowStartTime = "00:00") {
  return minutesOfDayToTime(parseTimeToMinutes(windowStartTime) + minutesFromGridStart);
}

export function timeToGridMinutes(time: string, windowStartTime = "00:00") {
  return (parseTimeToMinutes(time) - parseTimeToMinutes(windowStartTime) + VIEW_WINDOW_MINUTES) % VIEW_WINDOW_MINUTES;
}

export function getGridHours(windowStartTime = "00:00") {
  const startMinutes = parseTimeToMinutes(windowStartTime);
  return Array.from({ length: 24 }, (_item, index) => minutesOfDayToTime(startMinutes + index * 60));
}

export function parseTimeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesOfDayToTime(totalMinutes: number) {
  const normalized = ((totalMinutes % VIEW_WINDOW_MINUTES) + VIEW_WINDOW_MINUTES) % VIEW_WINDOW_MINUTES;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

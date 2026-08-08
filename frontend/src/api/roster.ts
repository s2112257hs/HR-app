import { apiRequest, jsonBody } from "./client";
import {
  AttendanceSummaryResponse,
  DayMarkerType,
  OtSummaryResponse,
  OverlapCheckResponse,
  RosterLockResponse,
  RosterResponse,
  RosterValidationResponse,
  Shift
} from "../types/api";

export type ShiftPayload = {
  employeeId: string;
  departmentId: string;
  startAt: string;
  endAt: string;
  unpaidBreakMinutes?: number;
  overtimeMinutes?: number;
  notes?: string | null;
  overlapAcknowledged?: boolean;
};

export type UpdateShiftPayload = Partial<ShiftPayload> & {
  version: number;
};

export type CopyWeeklyCellPayload = {
  employeeId: string;
  sourceDate: string;
  targetStartDate: string;
  targetEndDate: string;
  replaceExisting?: boolean;
};

export type CopyWeeklyCellResponse = {
  copiedKind: "SHIFT" | DayMarkerType | "EMPTY";
  copiedCount: number;
  targetDates: string[];
};

export type WeeklyCellKey = {
  employeeId: string;
  date: string;
};

export type WeeklyCellSnapshot = WeeklyCellKey & {
  marker?: {
    type: DayMarkerType;
    notes?: string | null;
  } | null;
  shifts: Array<{
    departmentId: string;
    startAt: string;
    endAt: string;
    unpaidBreakMinutes: number;
    overtimeMinutes?: number;
    notes?: string | null;
  }>;
};

export function fetchDailyRoster(date: string, startTime = "00:00") {
  const params = new URLSearchParams({ date, startTime });
  return apiRequest<RosterResponse>(`/roster/daily?${params.toString()}`);
}

export function fetchWeeklyRoster(startDate: string) {
  return apiRequest<RosterResponse>(`/roster/weekly?startDate=${encodeURIComponent(startDate)}`);
}

export function validateWeeklyRoster(startDate: string) {
  return apiRequest<RosterValidationResponse>(`/roster/weekly-validation?startDate=${encodeURIComponent(startDate)}`);
}

export function fetchOtSummary(fromDate: string, toDate: string) {
  const params = new URLSearchParams({ fromDate, toDate });
  return apiRequest<OtSummaryResponse>(`/roster/ot-summary?${params.toString()}`);
}

export function fetchAttendanceSummary(fromDate: string, toDate: string) {
  const params = new URLSearchParams({ fromDate, toDate });
  return apiRequest<AttendanceSummaryResponse>(`/roster/attendance-summary?${params.toString()}`);
}

export function checkShiftOverlap(payload: {
  employeeId: string;
  startAt: string;
  endAt: string;
  excludeShiftId?: string | null;
}) {
  return apiRequest<OverlapCheckResponse>("/shifts/check-overlap", {
    method: "POST",
    ...jsonBody(payload)
  });
}

export function copyWeeklyCell(payload: CopyWeeklyCellPayload) {
  return apiRequest<CopyWeeklyCellResponse>("/roster/weekly-cell-copy", {
    method: "POST",
    ...jsonBody(payload)
  });
}

export function clearWeeklyCells(cells: WeeklyCellKey[]) {
  return apiRequest<{ clearedCount: number }>("/roster/weekly-cells-clear", {
    method: "POST",
    ...jsonBody({ cells })
  });
}

export function restoreWeeklyCells(cells: WeeklyCellSnapshot[]) {
  return apiRequest<{ restoredCount: number }>("/roster/weekly-cells-restore", {
    method: "POST",
    ...jsonBody({ cells })
  });
}

export function fetchRosterLock() {
  return apiRequest<RosterLockResponse>("/roster/lock");
}

export function acquireRosterLock() {
  return apiRequest<RosterLockResponse>("/roster/lock", { method: "POST" });
}

export function heartbeatRosterLock() {
  return apiRequest<RosterLockResponse>("/roster/lock", { method: "PATCH" });
}

export function stealRosterLock() {
  return apiRequest<RosterLockResponse>("/roster/lock/steal", { method: "POST" });
}

export function releaseRosterLock() {
  return apiRequest<RosterLockResponse>("/roster/lock/release", { method: "POST" });
}

export function createShift(payload: ShiftPayload) {
  return apiRequest<Shift>("/shifts", {
    method: "POST",
    ...jsonBody(payload)
  });
}

export function updateShift(id: string, payload: UpdateShiftPayload) {
  return apiRequest<Shift>(`/shifts/${id}`, {
    method: "PATCH",
    ...jsonBody(payload)
  });
}

export function deleteShift(id: string) {
  return apiRequest<Shift>(`/shifts/${id}`, { method: "DELETE" });
}

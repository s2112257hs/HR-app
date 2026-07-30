import { apiRequest, jsonBody } from "./client";
import { OverlapCheckResponse, RosterResponse, RosterValidationResponse, Shift } from "../types/api";

export type ShiftPayload = {
  employeeId: string;
  departmentId: string;
  startAt: string;
  endAt: string;
  unpaidBreakMinutes: number;
  notes?: string | null;
  overlapAcknowledged?: boolean;
};

export type UpdateShiftPayload = Partial<ShiftPayload> & {
  version: number;
};

export type CopyDailySchedulePayload = {
  sourceDate: string;
  targetStartDate: string;
  targetEndDate: string;
  startTime?: string;
  overlapAcknowledged?: boolean;
};

export type CopyDailyScheduleResponse = {
  sourceDate: string;
  targetStartDate: string;
  targetEndDate: string;
  startTime: string;
  copiedCount: number;
  skippedDates: string[];
  createdShiftIds: string[];
};

export type CopyWeeklyCellPayload = {
  employeeId: string;
  sourceDate: string;
  targetStartDate: string;
  targetEndDate: string;
  replaceExisting?: boolean;
};

export type CopyWeeklyCellResponse = {
  copiedKind: "SHIFT" | "RDO" | "LEAVE" | "EMPTY";
  copiedCount: number;
  targetDates: string[];
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

export function copyDailySchedule(payload: CopyDailySchedulePayload) {
  return apiRequest<CopyDailyScheduleResponse>("/shifts/copy-daily", {
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

import { DayMarker, DayMarkerType, RdoTrackerResponse } from "../types/api";
import { apiRequest, jsonBody } from "./client";

export type DayMarkerPayload = {
  employeeId: string;
  date: string;
  type: DayMarkerType;
  notes?: string | null;
};

export function setDayMarker(payload: DayMarkerPayload) {
  return apiRequest<DayMarker>("/day-markers", {
    method: "POST",
    ...jsonBody(payload)
  });
}

export function removeDayMarker(id: string) {
  return apiRequest<DayMarker>(`/day-markers/${id}`, {
    method: "DELETE"
  });
}

export function fetchRdoTracker(asOfDate?: string) {
  const params = new URLSearchParams();
  if (asOfDate) {
    params.set("asOfDate", asOfDate);
  }
  const query = params.toString();
  return apiRequest<RdoTrackerResponse>(`/day-markers/rdo-tracker${query ? `?${query}` : ""}`);
}

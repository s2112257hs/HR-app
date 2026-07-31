import { apiRequest, jsonBody } from "./client";
import { ShiftDepartment, ValidationRule } from "../types/api";

export type OrganisationSettings = {
  id: string;
  name: string;
  timezone: string;
  rdoTrackingStartDate: string;
};

export function fetchSettings() {
  return apiRequest<OrganisationSettings>("/settings");
}

export function updateSettings(payload: { rdoTrackingStartDate: string }) {
  return apiRequest<OrganisationSettings>("/settings", {
    method: "PATCH",
    ...jsonBody(payload)
  });
}

export type RdoBalanceSetting = {
  employeeId: string;
  displayName: string;
  primaryDepartment?: ShiftDepartment | null;
  rdoBalanceBroughtForward: number;
};

export function fetchRdoBalances() {
  return apiRequest<RdoBalanceSetting[]>("/settings/rdo-balances");
}

export function updateRdoBalances(balances: Array<{ employeeId: string; rdoBalanceBroughtForward: number }>) {
  return apiRequest<RdoBalanceSetting[]>("/settings/rdo-balances", {
    method: "PATCH",
    ...jsonBody({ balances })
  });
}

export type ValidationRulePayload = {
  name: string;
  departmentId: string;
  startTime: string;
  endTime: string;
  minimumStaff: number;
};

export function fetchValidationRules() {
  return apiRequest<ValidationRule[]>("/settings/validation-rules");
}

export function createValidationRule(payload: ValidationRulePayload) {
  return apiRequest<ValidationRule>("/settings/validation-rules", {
    method: "POST",
    ...jsonBody(payload)
  });
}

export function updateValidationRule(id: string, payload: ValidationRulePayload) {
  return apiRequest<ValidationRule>(`/settings/validation-rules/${id}`, {
    method: "PATCH",
    ...jsonBody(payload)
  });
}

export function deactivateValidationRule(id: string) {
  return apiRequest<ValidationRule>(`/settings/validation-rules/${id}/deactivate`, {
    method: "POST"
  });
}

export function reactivateValidationRule(id: string) {
  return apiRequest<ValidationRule>(`/settings/validation-rules/${id}/reactivate`, {
    method: "POST"
  });
}

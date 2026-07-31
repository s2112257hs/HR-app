import { apiRequest, jsonBody } from "./client";
import { Department } from "../types/api";

export type DepartmentPayload = {
  name: string;
  shortCode: string;
  colourHex: string;
};

export function fetchDepartments(status = "active") {
  return apiRequest<Department[]>(`/departments?status=${encodeURIComponent(status)}`);
}

export function createDepartment(payload: DepartmentPayload) {
  return apiRequest<Department>("/departments", {
    method: "POST",
    ...jsonBody(payload)
  });
}

export function updateDepartment(id: string, payload: Partial<DepartmentPayload>) {
  return apiRequest<Department>(`/departments/${id}`, {
    method: "PATCH",
    ...jsonBody(payload)
  });
}

export function reorderDepartments(departmentIds: string[]) {
  return apiRequest<Department[]>("/departments/reorder", {
    method: "PATCH",
    ...jsonBody({ departmentIds })
  });
}

export function deactivateDepartment(id: string) {
  return apiRequest<Department>(`/departments/${id}`, { method: "DELETE" });
}

export function restoreDepartment(id: string) {
  return apiRequest<Department>(`/departments/${id}/restore`, { method: "PATCH" });
}

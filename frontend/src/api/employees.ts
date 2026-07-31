import { apiRequest, jsonBody } from "./client";
import { Employee } from "../types/api";

export type EmployeePayload = {
  employeeNumber?: string | null;
  firstName: string;
  lastName?: string | null;
  preferredName?: string | null;
  phone?: string | null;
  email?: string | null;
  employmentType?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  primaryDepartmentId?: string | null;
};

export function fetchEmployees(status = "active", search = "") {
  const params = new URLSearchParams({ status });
  if (search.trim()) {
    params.set("search", search.trim());
  }
  return apiRequest<Employee[]>(`/employees?${params.toString()}`);
}

export function createEmployee(payload: EmployeePayload) {
  return apiRequest<Employee>("/employees", {
    method: "POST",
    ...jsonBody(payload)
  });
}

export function updateEmployee(id: string, payload: Partial<EmployeePayload>) {
  return apiRequest<Employee>(`/employees/${id}`, {
    method: "PATCH",
    ...jsonBody(payload)
  });
}

export function reorderEmployees(employeeIds: string[]) {
  return apiRequest<Employee[]>("/employees/reorder", {
    method: "PATCH",
    ...jsonBody({ employeeIds })
  });
}

export function deactivateEmployee(id: string) {
  return apiRequest<Employee>(`/employees/${id}`, { method: "DELETE" });
}

export function restoreEmployee(id: string) {
  return apiRequest<Employee>(`/employees/${id}/restore`, { method: "PATCH" });
}

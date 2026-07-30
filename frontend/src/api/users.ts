import { apiRequest, jsonBody } from "./client";
import { User, UserRole } from "../types/api";

export type UserPayload = {
  name: string;
  email: string;
  password?: string;
  role: UserRole;
};

export function fetchUsers() {
  return apiRequest<User[]>("/users");
}

export function createUser(payload: Required<UserPayload>) {
  return apiRequest<User>("/users", {
    method: "POST",
    ...jsonBody(payload)
  });
}

export function updateUser(id: string, payload: UserPayload) {
  return apiRequest<User>(`/users/${id}`, {
    method: "PATCH",
    ...jsonBody(payload)
  });
}

export function deactivateUser(id: string) {
  return apiRequest<User>(`/users/${id}/deactivate`, { method: "PATCH" });
}

export function restoreUser(id: string) {
  return apiRequest<User>(`/users/${id}/restore`, { method: "PATCH" });
}


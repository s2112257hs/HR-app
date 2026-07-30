import { ApiErrorBody } from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";
export const AUTH_EXPIRED_EVENT = "hr-roster-auth-expired";

export class ApiError extends Error {
  body: ApiErrorBody;

  constructor(body: ApiErrorBody) {
    super(body.message);
    this.body = body;
  }
}

export function getAccessToken() {
  return localStorage.getItem("hr-roster-access-token");
}

export function setAccessToken(token: string | null) {
  if (token) {
    localStorage.setItem("hr-roster-access-token", token);
  } else {
    localStorage.removeItem("hr-roster-access-token");
  }
}

export function getRefreshToken() {
  return localStorage.getItem("hr-roster-refresh-token");
}

export function setRefreshToken(token: string | null) {
  if (token) {
    localStorage.setItem("hr-roster-refresh-token", token);
  } else {
    localStorage.removeItem("hr-roster-refresh-token");
  }
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");

  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const token = getAccessToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      statusCode: response.status,
      error: "REQUEST_FAILED",
      message: "The request could not be completed."
    }))) as ApiErrorBody;

    if (response.status === 401 && token && !path.startsWith("/auth/login")) {
      setAccessToken(null);
      setRefreshToken(null);
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
    }

    throw new ApiError(body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function jsonBody(body: unknown): RequestInit {
  return {
    body: JSON.stringify(body)
  };
}

import { ApiErrorBody } from "../types/api";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000/api/v1";
export const AUTH_EXPIRED_EVENT = "hr-roster-auth-expired";
const AUTH_LOGIN_PATH = "/auth/login";
const AUTH_REFRESH_PATH = "/auth/refresh";
const AUTH_LAST_ACTIVITY_KEY = "hr-roster-last-activity-at";
const ACCESS_TOKEN_INACTIVITY_LIMIT_MS = 15 * 60 * 1000;
let refreshRequest: Promise<boolean> | null = null;

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

export function recordAuthActivity() {
  localStorage.setItem(AUTH_LAST_ACTIVITY_KEY, String(Date.now()));
}

export function clearAuthActivity() {
  localStorage.removeItem(AUTH_LAST_ACTIVITY_KEY);
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let { response, token } = await sendRequest(path, init);

  if (response.status === 401 && token && canRefreshRequest(path)) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      ({ response, token } = await sendRequest(path, init));
    }
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      statusCode: response.status,
      error: "REQUEST_FAILED",
      message: "The request could not be completed."
    }))) as ApiErrorBody;

    if (response.status === 401 && token && !path.startsWith(AUTH_LOGIN_PATH)) {
      expireAuthSession();
    }

    throw new ApiError(body);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

async function sendRequest(path: string, init: RequestInit) {
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

  return { response, token };
}

function canRefreshRequest(path: string) {
  return !path.startsWith(AUTH_LOGIN_PATH) && !path.startsWith(AUTH_REFRESH_PATH);
}

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken || !hasRecentAuthActivity()) {
    return false;
  }

  if (!refreshRequest) {
    refreshRequest = fetch(`${API_BASE_URL}${AUTH_REFRESH_PATH}`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ refreshToken })
    })
      .then(async (response) => {
        if (!response.ok) {
          return false;
        }

        const body = (await response.json()) as { accessToken: string; refreshToken: string };
        setAccessToken(body.accessToken);
        setRefreshToken(body.refreshToken);
        return true;
      })
      .catch(() => false)
      .finally(() => {
        refreshRequest = null;
      });
  }

  return refreshRequest;
}

function expireAuthSession() {
  setAccessToken(null);
  setRefreshToken(null);
  clearAuthActivity();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

function hasRecentAuthActivity() {
  const raw = localStorage.getItem(AUTH_LAST_ACTIVITY_KEY);
  const lastActivityAt = raw ? Number(raw) : 0;

  return Number.isFinite(lastActivityAt) && Date.now() - lastActivityAt <= ACCESS_TOKEN_INACTIVITY_LIMIT_MS;
}

export function jsonBody(body: unknown): RequestInit {
  return {
    body: JSON.stringify(body)
  };
}

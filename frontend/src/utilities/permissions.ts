import type { User } from "../types/api";

export function canEditRosterDate(user: User | null, date: string) {
  if (user?.role === "ADMIN") {
    return true;
  }

  if (user?.role !== "ROSTER_MANAGER") {
    return false;
  }

  return date >= localTodayKey();
}

function localTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

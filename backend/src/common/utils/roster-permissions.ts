import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { DateTime } from "luxon";
import { AuthenticatedUser } from "../types/authenticated-user";

export function assertManagerCanEditTargetDate(currentUser: AuthenticatedUser, targetDate: string, timezone: string, field = "date") {
  assertManagerCanEditTargetDates(currentUser, [targetDate], timezone, field);
}

export function assertManagerCanEditTargetDates(currentUser: AuthenticatedUser, targetDates: string[], timezone: string, field = "targetStartDate") {
  if (currentUser.role !== UserRole.ROSTER_MANAGER) {
    return;
  }

  const today = DateTime.now().setZone(timezone).startOf("day");
  const firstPastDate = targetDates.find((targetDate) => DateTime.fromISO(targetDate, { zone: timezone }).startOf("day") < today);

  if (!firstPastDate) {
    return;
  }

  throw new ForbiddenException({
    error: "PAST_ROSTER_LOCKED",
    message: "Roster managers cannot edit past roster days. Ask an admin to change previous dates.",
    fields: {
      [field]: `${firstPastDate} is a past roster day.`
    }
  });
}

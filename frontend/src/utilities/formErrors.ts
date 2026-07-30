import { ApiError } from "../api/client";

const FIELD_LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  password: "Password",
  role: "Role",
  employeeNumber: "Employee number",
  firstName: "First name",
  lastName: "Last name",
  preferredName: "Preferred name",
  phone: "Phone",
  employmentType: "Employment type",
  startDate: "Start date",
  endDate: "End date",
  primaryDepartmentId: "Primary department",
  shortCode: "Short code",
  colourHex: "Colour",
  employeeId: "Employee",
  departmentId: "Department",
  startAt: "Start time",
  endAt: "End time",
  startTime: "Start time",
  endTime: "End time",
  minimumStaff: "Minimum staff",
  unpaidBreakMinutes: "Break"
};

export function friendlyApiMessage(error: unknown, fallback: string) {
  if (!(error instanceof ApiError)) {
    return fallback;
  }

  if (error.body.statusCode === 401) {
    return "The email or password is incorrect.";
  }

  if (error.body.statusCode === 403) {
    if (error.body.error === "PAST_ROSTER_LOCKED") {
      return "Roster managers cannot edit previous days. Ask an admin to change past rosters.";
    }
    return "You do not have permission to do that.";
  }

  if (error.body.error === "DAY_MARKER_CONFLICT") {
    return Object.values(error.body.fields ?? {})[0] ?? "This employee has an RDO or leave marker for that day.";
  }

  if (error.body.fields && Object.keys(error.body.fields).length > 0) {
    return "Please fix the highlighted fields.";
  }

  if (error.body.error === "UNIQUE_CONSTRAINT") {
    return "That value is already being used.";
  }

  if (error.body.error === "VALIDATION_ERROR") {
    return "Please check the form and try again.";
  }

  return friendlySentence(error.body.message) || fallback;
}

export function friendlyApiFieldErrors(error: unknown) {
  if (!(error instanceof ApiError) || !error.body.fields) {
    return {};
  }

  return Object.entries(error.body.fields).reduce<Record<string, string>>((fields, [field, message]) => {
    fields[field] = friendlyFieldMessage(field, message);
    return fields;
  }, {});
}

export function friendlyFieldMessage(field: string, message: string) {
  const label = FIELD_LABELS[field] ?? toTitleCase(field);
  const lower = message.toLowerCase();
  const maxLength = lower.match(/(?:shorter than or equal to|must be .*?)(\d+)/)?.[1];

  if (lower.includes("already") || lower.includes("unique")) {
    return `${label} is already in use.`;
  }

  if (field === "password" || lower.includes("password")) {
    if (lower.includes("8") || lower.includes("longer than")) {
      return "Password must be at least 8 characters.";
    }
    return "Enter a valid password.";
  }

  if (field === "email" || lower.includes("email")) {
    return "Enter a valid email address.";
  }

  if (field === "colourHex" || lower.includes("matches")) {
    return "Choose a colour or enter a valid hex code, for example #2563EB.";
  }

  if (field === "role" || lower.includes("enum")) {
    return "Choose a valid role.";
  }

  if (lower.includes("uuid")) {
    return `Choose a valid ${label.toLowerCase()}.`;
  }

  if (lower.includes("required") || lower.includes("must be a string") || lower.includes("should not be empty")) {
    return `${label} is required.`;
  }

  if (maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
  }

  if (lower.includes("date")) {
    return `${label} must be a valid date.`;
  }

  return friendlySentence(message) || `Please check ${label.toLowerCase()}.`;
}

function friendlySentence(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed === "Forbidden resource") {
    return "You do not have permission to do that.";
  }

  if (trimmed.toLowerCase().includes("invalid email or password")) {
    return "The email or password is incorrect.";
  }

  return trimmed.endsWith(".") ? trimmed : `${trimmed}.`;
}

function toTitleCase(field: string) {
  return field
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase())
    .trim();
}

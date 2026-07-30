export type UserRole = "ADMIN" | "ROSTER_MANAGER" | "VIEWER";
export type DayMarkerType = "RDO" | "LEAVE";

export type User = {
  id: string;
  organisationId: string;
  name: string;
  email: string;
  role: UserRole;
  isActive?: boolean;
  lastLoginAt?: string | null;
};

export type Employee = {
  id: string;
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
  primaryDepartment?: ShiftDepartment | null;
  displayOrder?: number;
  isActive: boolean;
  deletedAt?: string | null;
};

export type Department = {
  id: string;
  name: string;
  shortCode: string;
  colourHex: string;
  displayOrder?: number;
  isActive: boolean;
  deletedAt?: string | null;
};

export type ShiftDepartment = Pick<Department, "id" | "name" | "shortCode" | "colourHex">;

export type Shift = {
  id: string;
  employeeId: string;
  department: ShiftDepartment;
  departmentId?: string;
  startAt: string;
  endAt: string;
  unpaidBreakMinutes: number;
  notes?: string | null;
  status: "SCHEDULED" | "CANCELLED";
  version: number;
  rosterSegments?: Array<{
    date: string;
    startTime: string;
    endTime: string;
    startsBeforeDate: boolean;
    endsAfterDate: boolean;
  }>;
  hasOverlap: boolean;
};

export type DayMarker = {
  id: string;
  employeeId: string;
  date: string;
  type: DayMarkerType;
  notes?: string | null;
  startAt?: string | null;
  endAt?: string | null;
};

export type RosterEmployee = {
  id: string;
  employeeNumber?: string | null;
  displayName: string;
  firstName: string;
  lastName?: string | null;
  preferredName?: string | null;
  primaryDepartmentId?: string | null;
  primaryDepartment?: ShiftDepartment | null;
  isActive: boolean;
  dayMarkers: DayMarker[];
  shifts: Shift[];
};

export type RosterResponse = {
  startDate: string;
  endDateExclusive: string;
  windowStartAt?: string;
  windowEndAt?: string;
  timezone: string;
  dates: string[];
  employees: RosterEmployee[];
};

export type ValidationRule = {
  id: string;
  organisationId: string;
  departmentId: string;
  name: string;
  startTime: string;
  endTime: string;
  minimumStaff: number;
  isActive: boolean;
  department: ShiftDepartment & { isActive: boolean };
  createdAt: string;
  updatedAt: string;
};

export type RosterValidationViolation = {
  ruleId: string;
  ruleName: string;
  date: string;
  department: ShiftDepartment;
  startTime: string;
  endTime: string;
  minimumStaff: number;
  actualMinimumStaff: number;
  firstShortfallStart: string;
  firstShortfallEnd: string;
};

export type RosterValidationResponse = {
  valid: boolean;
  startDate: string;
  endDateExclusive: string;
  timezone: string;
  checkedRules: number;
  violations: RosterValidationViolation[];
};

export type OverlapCheckResponse = {
  hasOverlap: boolean;
  overlaps: Array<{
    shiftId: string;
    departmentName: string;
    departmentShortCode: string;
    startAt: string;
    endAt: string;
  }>;
};

export type ApiErrorBody = {
  statusCode: number;
  error: string;
  message: string;
  fields?: Record<string, string>;
  overlaps?: OverlapCheckResponse["overlaps"];
  targetCells?: Array<{
    date: string;
    shiftCount: number;
    markerType?: DayMarkerType | null;
  }>;
};

export type RdoTrackerResponse = {
  asOfDate: string;
  timezone: string;
  employees: Array<{
    employeeId: string;
    employeeNumber?: string | null;
    displayName: string;
    primaryDepartment?: ShiftDepartment | null;
    trackingStartDate: string;
    requiredRdo: number;
    rdoTaken: number;
    rdoOwed: number;
  }>;
};

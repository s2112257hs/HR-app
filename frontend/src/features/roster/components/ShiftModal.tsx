import { zodResolver } from "@hookform/resolvers/zod";
import { Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError } from "../../../api/client";
import { checkShiftOverlap, createShift, deleteShift, updateShift } from "../../../api/roster";
import { useAuth } from "../../authentication/AuthProvider";
import { Department, Employee, OverlapCheckResponse, Shift } from "../../../types/api";
import { friendlyApiFieldErrors, friendlyApiMessage } from "../../../utilities/formErrors";
import { canEditRosterDate } from "../../../utilities/permissions";
import { dateKeyFromIso, timeLabel, toLocalDateTimeIso } from "../utilities/dates";
import { OverlapWarningDialog } from "./OverlapWarningDialog";

const schema = z.object({
  employeeId: z.string().uuid("Choose an employee."),
  departmentId: z.string().uuid("Choose a department."),
  date: z.string().min(10, "Choose a date."),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a valid start time."),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "Enter a valid end time."),
  overtime: z.string().regex(/^\d{1,3}:\d{2}$/, "Enter overtime as HH:MM.").refine((value) => overtimeToMinutes(value) !== null, "Enter a valid overtime duration."),
  notes: z.string().optional()
});

type ShiftForm = z.infer<typeof schema>;

export type ShiftModalState =
  | {
      mode: "create";
      employeeId: string;
      date: string;
      startTime?: string;
      endTime?: string;
    }
  | {
      mode: "edit";
      shift: Shift;
      employeeId: string;
    };

type Props = {
  state: ShiftModalState;
  employees: Employee[];
  departments: Department[];
  onClose: () => void;
  onBeforeMutation?: (cells: Array<{ employeeId: string; date: string }>) => boolean;
};

export function ShiftModal({ state, employees, departments, onClose, onBeforeMutation }: Props) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [overlaps, setOverlaps] = useState<OverlapCheckResponse["overlaps"] | null>(null);
  const rosterDate = state.mode === "edit" ? dateKeyFromIso(state.shift.startAt) : state.date;
  const canEdit = canEditRosterDate(user, rosterDate);
  const defaultValues = useMemo<ShiftForm>(() => {
    if (state.mode === "edit") {
      return {
        employeeId: state.employeeId,
        departmentId: state.shift.department.id,
        date: dateKeyFromIso(state.shift.startAt),
        startTime: timeLabel(state.shift.startAt),
        endTime: timeLabel(state.shift.endAt),
        overtime: minutesToOvertimeValue(state.shift.overtimeMinutes ?? 0),
        notes: state.shift.notes ?? ""
      };
    }

    const selectedEmployee = employees.find((employee) => employee.id === state.employeeId);

    return {
      employeeId: state.employeeId,
      departmentId: selectedEmployee?.primaryDepartmentId || selectedEmployee?.primaryDepartment?.id || departments[0]?.id || "",
      date: state.date,
      startTime: state.startTime ?? "08:00",
      endTime: state.endTime ?? "12:00",
      overtime: "00:00",
      notes: ""
    };
  }, [departments, employees, state]);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    reset,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm<ShiftForm>({
    resolver: zodResolver(schema),
    defaultValues
  });
  const overtimeField = register("overtime");

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const setOvertimeMinutes = (minutes: number) => {
    const values = getValues();
    const maxMinutes = shiftDurationMinutes(values.startTime, values.endTime);
    const nextMinutes = Math.min(Math.max(minutes, 0), maxMinutes);
    setValue("overtime", minutesToOvertimeValue(nextMinutes), { shouldDirty: true, shouldValidate: true });
  };

  const adjustOvertime = (deltaMinutes: number) => {
    setOvertimeMinutes((overtimeToMinutes(getValues("overtime")) ?? 0) + deltaMinutes);
  };

  const validateOvertimeForValues = (values: ShiftForm) => {
    const overtimeMinutes = overtimeToMinutes(values.overtime);
    const maxMinutes = shiftDurationMinutes(values.startTime, values.endTime);

    if (overtimeMinutes !== null && overtimeMinutes > maxMinutes) {
      setError("overtime", { message: `OT cannot exceed shift duration (${minutesToOvertimeValue(maxMinutes)}).` });
      return false;
    }

    return true;
  };

  const saveMutation = useMutation({
    mutationFn: async (values: ShiftForm & { overlapAcknowledged?: boolean }) => {
      const overnight = values.endTime <= values.startTime;
      const payload = {
        employeeId: values.employeeId,
        departmentId: values.departmentId,
        startAt: toLocalDateTimeIso(values.date, values.startTime),
        endAt: toLocalDateTimeIso(values.date, values.endTime, overnight),
        overtimeMinutes: overtimeToMinutes(values.overtime) ?? 0,
        notes: values.notes?.trim() || null,
        overlapAcknowledged: values.overlapAcknowledged
      };

      if (state.mode === "edit") {
        return updateShift(state.shift.id, {
          ...payload,
          version: state.shift.version
        });
      }

      return createShift(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roster"] });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        if (error.body.error === "SHIFT_OVERLAP" && error.body.overlaps) {
          setOverlaps(error.body.overlaps);
          return;
        }
        Object.entries(friendlyApiFieldErrors(error)).forEach(([field, message]) => {
          setError(toShiftFormField(field), { message });
        });
        setError("root", { message: friendlyApiMessage(error, "Shift could not be saved.") });
      }
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      if (state.mode === "edit") {
        await deleteShift(state.shift.id);
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["roster"] });
      onClose();
    }
  });

  const onSubmit = handleSubmit(async (values) => {
    if (!canEditRosterDate(user, values.date)) {
      setError("root", { message: "Roster managers cannot edit previous days. Ask an admin to change past rosters." });
      return;
    }
    if (!validateOvertimeForValues(values)) {
      return;
    }

    const overnight = values.endTime <= values.startTime;
    const overlap = await checkShiftOverlap({
      employeeId: values.employeeId,
      startAt: toLocalDateTimeIso(values.date, values.startTime),
      endAt: toLocalDateTimeIso(values.date, values.endTime, overnight),
      excludeShiftId: state.mode === "edit" ? state.shift.id : null
    });

    if (overlap.hasOverlap) {
      setOverlaps(overlap.overlaps);
      return;
    }

    if (onBeforeMutation && !onBeforeMutation(cellsForValues(state, values))) {
      return;
    }

    saveMutation.mutate(values);
  });

  const confirmOverlap = () => {
    const values = getValues();
    if (!validateOvertimeForValues(values)) {
      return;
    }
    if (onBeforeMutation && !onBeforeMutation(cellsForValues(state, values))) {
      return;
    }
    saveMutation.mutate({ ...values, overlapAcknowledged: true });
  };

  const cancelShift = () => {
    if (state.mode === "edit" && onBeforeMutation?.([{ employeeId: state.employeeId, date: dateKeyFromIso(state.shift.startAt) }]) === false) {
      return;
    }

    deleteMutation.mutate();
  };

  return (
    <>
      <div className="modal-backdrop" role="presentation">
        <form className="dialog-panel shift-modal" onSubmit={onSubmit} role="dialog" aria-modal="true">
          <div className="modal-title-row">
            <h2>{state.mode === "edit" ? "Edit shift" : "Create shift"}</h2>
            <button className="icon-button" type="button" onClick={onClose} aria-label="Close shift modal">
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          {!canEdit && <div className="form-error">Roster managers cannot edit previous days. Ask an admin to change past rosters.</div>}
          <div className="shift-form-grid">
            <label>
              Employee
              <select {...register("employeeId")} disabled={!canEdit}>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.preferredName || [employee.firstName, employee.lastName].filter(Boolean).join(" ")}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Department
              <select {...register("departmentId")} disabled={!canEdit}>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.shortCode} - {department.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input type="date" {...register("date")} disabled={!canEdit} />
            </label>
          </div>
          <div className="shift-form-grid">
            <label>
              Start
              <input type="time" step="900" {...register("startTime")} disabled={!canEdit} />
            </label>
            <label>
              End
              <input type="time" step="900" {...register("endTime")} disabled={!canEdit} />
            </label>
            <label>
              Overtime (HH:MM)
              <span className="duration-stepper">
                <button className="duration-stepper-button" type="button" onClick={() => adjustOvertime(-15)} disabled={!canEdit} aria-label="Decrease overtime by 15 minutes">
                  -
                </button>
                <input
                  placeholder="HH:MM"
                  inputMode="numeric"
                  {...overtimeField}
                  onChange={(event) => {
                    event.target.value = formatOvertimeInput(event.target.value);
                    void overtimeField.onChange(event);
                  }}
                  onBlur={(event) => {
                    event.target.value = normaliseOvertimeInput(event.target.value);
                    void overtimeField.onChange(event);
                    void overtimeField.onBlur(event);
                  }}
                  disabled={!canEdit}
                />
                <button className="duration-stepper-button" type="button" onClick={() => adjustOvertime(15)} disabled={!canEdit} aria-label="Increase overtime by 15 minutes">
                  +
                </button>
              </span>
            </label>
          </div>
          <label>
            Notes
            <textarea rows={3} {...register("notes")} disabled={!canEdit} />
          </label>
          {Object.values(errors).length > 0 && (
            <div className="form-error">
              {errors.root?.message ||
                errors.startTime?.message ||
                errors.endTime?.message ||
                errors.overtime?.message ||
                errors.employeeId?.message ||
                errors.departmentId?.message ||
                "Check the highlighted fields."}
            </div>
          )}
          <div className="dialog-actions split">
            {state.mode === "edit" && (
              <button className="danger-button" type="button" onClick={cancelShift} disabled={!canEdit || deleteMutation.isPending}>
                <Trash2 size={16} aria-hidden="true" />
                {deleteMutation.isPending ? "Cancelling..." : "Cancel shift"}
              </button>
            )}
            <div className="right-actions">
              <button className="secondary-button" type="button" onClick={onClose}>
                Close
              </button>
              <button className="primary-button" type="submit" disabled={!canEdit || isSubmitting || saveMutation.isPending}>
                {saveMutation.isPending || isSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
      </div>
      {overlaps && (
        <OverlapWarningDialog
          overlaps={overlaps}
          onCancel={() => setOverlaps(null)}
          onConfirm={confirmOverlap}
          pending={saveMutation.isPending}
        />
      )}
    </>
  );
}

function cellsForValues(state: ShiftModalState, values: ShiftForm) {
  const cells = [{ employeeId: values.employeeId, date: values.date }];
  if (state.mode === "edit") {
    const oldCell = { employeeId: state.employeeId, date: dateKeyFromIso(state.shift.startAt) };
    if (!cells.some((cell) => cell.employeeId === oldCell.employeeId && cell.date === oldCell.date)) {
      cells.push(oldCell);
    }
  }
  return cells;
}

function toShiftFormField(field: string) {
  if (field === "startAt") {
    return "startTime";
  }
  if (field === "endAt") {
    return "endTime";
  }
  if (field === "overtimeMinutes") {
    return "overtime";
  }

  return field as keyof ShiftForm;
}

function overtimeToMinutes(value: string) {
  const match = /^(\d{1,3}):(\d{2})$/.exec(value);
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes > 59) {
    return null;
  }
  return hours * 60 + minutes;
}

function minutesToOvertimeValue(totalMinutes: number) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatOvertimeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) {
    return digits;
  }

  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

function normaliseOvertimeInput(value: string) {
  const digits = value.replace(/\D/g, "").slice(0, 4);
  if (!digits) {
    return "00:00";
  }

  return formatOvertimeInput(digits.padEnd(4, "0"));
}

function shiftDurationMinutes(startTime: string, endTime: string) {
  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);
  if (startMinutes === null || endMinutes === null) {
    return 0;
  }

  return endMinutes <= startMinutes ? endMinutes + 24 * 60 - startMinutes : endMinutes - startMinutes;
}

function timeToMinutes(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
}

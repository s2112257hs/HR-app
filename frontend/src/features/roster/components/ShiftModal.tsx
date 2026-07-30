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
  unpaidBreakMinutes: z.coerce.number().int("Break must be a whole number.").min(0, "Break cannot be negative.").default(0),
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
};

export function ShiftModal({ state, employees, departments, onClose }: Props) {
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
        unpaidBreakMinutes: state.shift.unpaidBreakMinutes,
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
      unpaidBreakMinutes: 0,
      notes: ""
    };
  }, [departments, employees, state]);

  const {
    register,
    handleSubmit,
    setError,
    reset,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm<ShiftForm>({
    resolver: zodResolver(schema),
    defaultValues
  });

  useEffect(() => {
    reset(defaultValues);
  }, [defaultValues, reset]);

  const saveMutation = useMutation({
    mutationFn: async (values: ShiftForm & { overlapAcknowledged?: boolean }) => {
      const overnight = values.endTime <= values.startTime;
      const payload = {
        employeeId: values.employeeId,
        departmentId: values.departmentId,
        startAt: toLocalDateTimeIso(values.date, values.startTime),
        endAt: toLocalDateTimeIso(values.date, values.endTime, overnight),
        unpaidBreakMinutes: values.unpaidBreakMinutes,
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

    saveMutation.mutate(values);
  });

  const confirmOverlap = () => {
    saveMutation.mutate({
      ...getValues(),
      overlapAcknowledged: true
    });
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
          <div className="form-grid">
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
            <label>
              Start
              <input type="time" step="900" {...register("startTime")} disabled={!canEdit} />
            </label>
            <label>
              End
              <input type="time" step="900" {...register("endTime")} disabled={!canEdit} />
            </label>
            <label>
              Break
              <input type="number" min="0" step="5" {...register("unpaidBreakMinutes")} disabled={!canEdit} />
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
                errors.employeeId?.message ||
                errors.departmentId?.message ||
                "Check the highlighted fields."}
            </div>
          )}
          <div className="dialog-actions split">
            {state.mode === "edit" && (
              <button className="danger-button" type="button" onClick={() => deleteMutation.mutate()} disabled={!canEdit || deleteMutation.isPending}>
                <Trash2 size={16} aria-hidden="true" />
                Cancel shift
              </button>
            )}
            <div className="right-actions">
              <button className="secondary-button" type="button" onClick={onClose}>
                Close
              </button>
              <button className="primary-button" type="submit" disabled={!canEdit || isSubmitting || saveMutation.isPending}>
                Save
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

function toShiftFormField(field: string) {
  if (field === "startAt") {
    return "startTime";
  }
  if (field === "endAt") {
    return "endTime";
  }

  return field as keyof ShiftForm;
}

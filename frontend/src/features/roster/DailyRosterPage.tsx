import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addHours, addMinutes, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Copy, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { fetchDepartments } from "../../api/departments";
import { fetchEmployees } from "../../api/employees";
import { checkShiftOverlap, copyDailySchedule, fetchDailyRoster, updateShift, type CopyDailySchedulePayload } from "../../api/roster";
import { useAuth } from "../authentication/AuthProvider";
import { OverlapCheckResponse, Shift } from "../../types/api";
import { friendlyApiMessage } from "../../utilities/formErrors";
import { canEditRosterDate } from "../../utilities/permissions";
import { DailyRosterGrid } from "./components/DailyRosterGrid";
import { OverlapWarningDialog } from "./components/OverlapWarningDialog";
import { ShiftModal, ShiftModalState } from "./components/ShiftModal";
import { todayKey } from "./utilities/dates";

type PendingMove = {
  employeeId: string;
  shift: Shift;
  startAt: string;
  endAt: string;
  overlaps: Array<{
    shiftId: string;
    departmentName: string;
    departmentShortCode: string;
    startAt: string;
    endAt: string;
  }>;
};

type PendingCopy = {
  payload: CopyDailySchedulePayload;
  overlaps: OverlapCheckResponse["overlaps"];
};

export function DailyRosterPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") ?? todayKey());
  const [windowStartTime, setWindowStartTime] = useState("00:00");
  const [drag, setDrag] = useState<Parameters<typeof DailyRosterGrid>[0]["drag"]>(null);
  const [modal, setModal] = useState<ShiftModalState | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyStartDate, setCopyStartDate] = useState("");
  const [copyEndDate, setCopyEndDate] = useState("");
  const [copyError, setCopyError] = useState<string | null>(null);
  const [copyMessage, setCopyMessage] = useState<string | null>(null);
  const [pendingCopy, setPendingCopy] = useState<PendingCopy | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const rosterQuery = useQuery({
    queryKey: ["roster", "daily", date, windowStartTime],
    queryFn: () => fetchDailyRoster(date, windowStartTime)
  });
  const employeesQuery = useQuery({
    queryKey: ["employees", "active"],
    queryFn: () => fetchEmployees("active")
  });
  const departmentsQuery = useQuery({
    queryKey: ["departments", "active"],
    queryFn: () => fetchDepartments("active")
  });

  useEffect(() => {
    const queryDate = searchParams.get("date");
    if (queryDate) {
      setDate(queryDate);
    }
  }, [searchParams]);

  const employees = employeesQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const windowStart = parseISO(`${date}T${windowStartTime}`);
  const windowEndDisplay = addMinutes(windowStart, 24 * 60 - 1);
  const canEditDate = canEditRosterDate(user, date);
  const moveWindow = (hours: number) => {
    const nextWindowStart = addHours(windowStart, hours);
    setDate(format(nextWindowStart, "yyyy-MM-dd"));
    setWindowStartTime(format(nextWindowStart, "HH:mm"));
  };
  const openCopyDialog = () => {
    if (!canEditDate) {
      return;
    }

    const nextDate = format(addDays(parseISO(date), 1), "yyyy-MM-dd");
    setCopyStartDate(nextDate);
    setCopyEndDate(nextDate);
    setCopyError(null);
    setCopyMessage(null);
    setPendingCopy(null);
    setCopyDialogOpen(true);
  };
  const moveMutation = useMutation({
    mutationFn: (input: Omit<PendingMove, "overlaps"> & { overlapAcknowledged?: boolean }) =>
      updateShift(input.shift.id, {
        employeeId: input.employeeId,
        startAt: input.startAt,
        endAt: input.endAt,
        version: input.shift.version,
        overlapAcknowledged: input.overlapAcknowledged
      }),
    onSuccess: async () => {
      setPendingMove(null);
      setMoveError(null);
      await queryClient.invalidateQueries({ queryKey: ["roster"] });
    },
    onError: (error) => {
      setMoveError(friendlyApiMessage(error, "Shift could not be moved."));
    }
  });
  const copyMutation = useMutation({
    mutationFn: (payload: CopyDailySchedulePayload) => copyDailySchedule(payload),
    onSuccess: async (result) => {
      setCopyDialogOpen(false);
      setCopyError(null);
      setPendingCopy(null);
      setCopyMessage(
        result.copiedCount === 1
          ? "Copied 1 shift."
          : `Copied ${result.copiedCount} shifts.${result.skippedDates.length > 0 ? " Source date was skipped." : ""}`
      );
      await queryClient.invalidateQueries({ queryKey: ["roster"] });
    },
    onError: (error, payload) => {
      if (error instanceof ApiError && error.body.error === "SHIFT_COPY_OVERLAP" && error.body.overlaps?.length) {
        setPendingCopy({ payload, overlaps: error.body.overlaps });
        setCopyDialogOpen(false);
        setCopyError(null);
        return;
      }

      setCopyError(friendlyApiMessage(error, "Schedule could not be copied."));
    }
  });

  const submitCopy = () => {
    setCopyError(null);
    setCopyMessage(null);

    if (!copyStartDate || !copyEndDate) {
      setCopyError("Choose a start date and end date.");
      return;
    }

    if (copyEndDate < copyStartDate) {
      setCopyError("End date must be the same as or later than start date.");
      return;
    }

    copyMutation.mutate({
      sourceDate: date,
      targetStartDate: copyStartDate,
      targetEndDate: copyEndDate,
      startTime: windowStartTime
    });
  };

  const handleMoveShift = async (employeeId: string, shift: Shift, startAt: string, endAt: string) => {
    setMoveError(null);
    if (!canEditDate) {
      setMoveError("Roster managers cannot edit previous days. Ask an admin to change past rosters.");
      return;
    }

    try {
      const overlap = await checkShiftOverlap({
        employeeId,
        startAt,
        endAt,
        excludeShiftId: shift.id
      });

      if (overlap.hasOverlap) {
        setPendingMove({ employeeId, shift, startAt, endAt, overlaps: overlap.overlaps });
        return;
      }

      moveMutation.mutate({ employeeId, shift, startAt, endAt });
    } catch (error) {
      setMoveError(friendlyApiMessage(error, "Shift could not be moved."));
    }
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>Daily roster</h1>
          <p>
            {format(windowStart, "yyyy-MM-dd HH:mm")} to {format(windowEndDisplay, "yyyy-MM-dd HH:mm")}
          </p>
        </div>
        <div className="toolbar">
          <button className="icon-button" type="button" onClick={() => setDate(format(addDays(parseISO(date), -1), "yyyy-MM-dd"))} aria-label="Previous day">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button className="secondary-button" type="button" onClick={() => setDate(todayKey())}>
            <RotateCcw size={16} aria-hidden="true" />
            Today
          </button>
          <button className="icon-button" type="button" onClick={() => setDate(format(addDays(parseISO(date), 1), "yyyy-MM-dd"))} aria-label="Next day">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <div className="window-stepper" aria-label="Daily window start">
            <button className="icon-button" type="button" onClick={() => moveWindow(-24)} aria-label="Move window back one day" title="Back 24 hours">
              <ChevronsLeft size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={() => moveWindow(-1)} aria-label="Move window back one hour">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <span>Start {windowStartTime}</span>
            <button className="icon-button" type="button" onClick={() => moveWindow(1)} aria-label="Move window forward one hour">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
            <button className="icon-button" type="button" onClick={() => moveWindow(24)} aria-label="Move window forward one day" title="Forward 24 hours">
              <ChevronsRight size={18} aria-hidden="true" />
            </button>
          </div>
          <button className="secondary-button" type="button" onClick={openCopyDialog} disabled={!canEditDate}>
            <Copy size={16} aria-hidden="true" />
            Copy schedule
          </button>
        </div>
      </header>
      {rosterQuery.isLoading && <div className="skeleton-panel" />}
      {rosterQuery.isError && (
        <div className="form-error">
          Roster could not be loaded.
          <button className="link-button" type="button" onClick={() => void rosterQuery.refetch()}>
            Retry
          </button>
        </div>
      )}
      {moveError && <div className="form-error">{moveError}</div>}
      {copyMessage && <div className="form-success">{copyMessage}</div>}
      {rosterQuery.data && (
        <DailyRosterGrid
          date={date}
          windowStartTime={windowStartTime}
          windowStartAt={rosterQuery.data.windowStartAt}
          timezone={rosterQuery.data.timezone}
          employees={rosterQuery.data.employees}
          drag={drag}
          setDrag={setDrag}
          onCreateShift={(employeeId, shiftDate, startTime, endTime) => setModal({ mode: "create", employeeId, date: shiftDate, startTime, endTime })}
          onEditShift={(employeeId, shift) => setModal({ mode: "edit", employeeId, shift })}
          onMoveShift={(employeeId, shift, startAt, endAt) => void handleMoveShift(employeeId, shift, startAt, endAt)}
          canEdit={canEditDate}
        />
      )}
      {pendingMove && (
        <OverlapWarningDialog
          overlaps={pendingMove.overlaps}
          onCancel={() => setPendingMove(null)}
          onConfirm={() => moveMutation.mutate({ ...pendingMove, overlapAcknowledged: true })}
          confirmLabel="Move anyway"
          pending={moveMutation.isPending}
        />
      )}
      {pendingCopy && (
        <OverlapWarningDialog
          overlaps={pendingCopy.overlaps}
          onCancel={() => {
            setPendingCopy(null);
            setCopyDialogOpen(true);
          }}
          onConfirm={() => copyMutation.mutate({ ...pendingCopy.payload, overlapAcknowledged: true })}
          confirmLabel="Copy anyway"
          pending={copyMutation.isPending}
        />
      )}
      {copyDialogOpen && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="dialog-panel copy-schedule-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              submitCopy();
            }}
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-title-row">
              <h2>Copy daily schedule</h2>
            </div>
            <p className="dialog-note">
              Copy shifts from {format(windowStart, "yyyy-MM-dd HH:mm")} to {format(windowEndDisplay, "yyyy-MM-dd HH:mm")} into each selected date.
            </p>
            <div className="form-grid two">
              <label>
                From
                <input type="date" value={copyStartDate} onChange={(event) => setCopyStartDate(event.target.value)} />
              </label>
              <label>
                To
                <input type="date" value={copyEndDate} onChange={(event) => setCopyEndDate(event.target.value)} />
              </label>
            </div>
            {copyError && <div className="form-error">{copyError}</div>}
            <div className="dialog-actions">
              <button
                className="secondary-button"
                type="button"
                onClick={() => {
                  setCopyDialogOpen(false);
                  setCopyError(null);
                }}
              >
                Cancel
              </button>
              <button className="primary-button" type="submit" disabled={copyMutation.isPending}>
                {copyMutation.isPending ? "Copying..." : "Copy"}
              </button>
            </div>
          </form>
        </div>
      )}
      {modal && <ShiftModal state={modal} employees={employees} departments={departments} onClose={() => setModal(null)} />}
    </section>
  );
}

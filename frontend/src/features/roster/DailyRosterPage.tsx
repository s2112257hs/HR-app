import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, addHours, addMinutes, format, parseISO } from "date-fns";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { fetchDepartments } from "../../api/departments";
import { fetchEmployees } from "../../api/employees";
import {
  acquireRosterLock,
  checkShiftOverlap,
  fetchDailyRoster,
  heartbeatRosterLock,
  releaseRosterLock,
  stealRosterLock,
  updateShift
} from "../../api/roster";
import { useAuth } from "../authentication/AuthProvider";
import { OverlapCheckResponse, RosterLockResponse, Shift } from "../../types/api";
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

export function DailyRosterPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [date, setDate] = useState(searchParams.get("date") ?? todayKey());
  const [windowStartTime, setWindowStartTime] = useState("00:00");
  const [drag, setDrag] = useState<Parameters<typeof DailyRosterGrid>[0]["drag"]>(null);
  const [modal, setModal] = useState<ShiftModalState | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [moveError, setMoveError] = useState<string | null>(null);
  const [lockState, setLockState] = useState<RosterLockResponse | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockUnavailable, setLockUnavailable] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const releaseLockOnUnmount = useRef(false);
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
  const hasRosterLock = Boolean(lockState?.locked && lockState.lock?.lockedByUserId === user?.id);
  const rosterLockedByOther = Boolean(lockState?.locked && lockState.lock?.lockedByUserId !== user?.id);
  const canEditDailyRoster = canEditDate && (lockUnavailable || hasRosterLock);

  function applyRosterLock(state: RosterLockResponse) {
    releaseLockOnUnmount.current = Boolean(state.locked && state.lock?.lockedByUserId === user?.id);
    setLockUnavailable(false);
    setLockState(state);
    setLockError(null);
  }

  function handleRosterLockError(error: unknown) {
    releaseLockOnUnmount.current = false;
    if (isMissingLockEndpoint(error)) {
      setLockUnavailable(true);
      setLockState(null);
      setLockError(null);
      return;
    }
    if (error instanceof ApiError && error.body.lock) {
      setLockState({ locked: true, lock: error.body.lock });
      setLockError(null);
      return;
    }
    setLockError("Acquire the roster lock to make changes.");
  }

  async function requestRosterLock() {
    setLockBusy(true);
    try {
      applyRosterLock(await acquireRosterLock());
    } catch (error) {
      handleRosterLockError(error);
    } finally {
      setLockBusy(false);
    }
  }

  useEffect(() => {
    if (user?.role === "VIEWER") {
      return;
    }

    void requestRosterLock();

    return () => {
      if (releaseLockOnUnmount.current) {
        void releaseRosterLock().catch(() => undefined);
      }
    };
  }, [user?.id, user?.role]);

  useEffect(() => {
    if (!hasRosterLock) {
      return;
    }

    const intervalId = window.setInterval(() => {
      heartbeatRosterLock()
        .then((state) => setLockState(state))
        .catch((error) => setLockError(friendlyApiMessage(error, "Roster lock could not be refreshed.")));
    }, 120_000);

    return () => window.clearInterval(intervalId);
  }, [hasRosterLock]);

  const moveWindow = (hours: number) => {
    const nextWindowStart = addHours(windowStart, hours);
    setDate(format(nextWindowStart, "yyyy-MM-dd"));
    setWindowStartTime(format(nextWindowStart, "HH:mm"));
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
  const stealLockMutation = useMutation({
    mutationFn: stealRosterLock,
    onSuccess: (state) => {
      applyRosterLock(state);
    },
    onError: (error) => setLockError(friendlyApiMessage(error, "Roster lock could not be taken."))
  });

  const handleMoveShift = async (employeeId: string, shift: Shift, startAt: string, endAt: string) => {
    setMoveError(null);
    if (!canEditDate) {
      setMoveError("Roster managers cannot edit previous days. Ask an admin to change past rosters.");
      return;
    }
    if (!lockUnavailable && !hasRosterLock) {
      setMoveError("Acquire the roster lock to make changes.");
      return;
    }
    if (!confirmAdminPastDates([dateKey(startAt), dateKey(endAt)])) {
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

  const beforeShiftMutation = (cells: Array<{ date: string }>) => {
    if (!lockUnavailable && !hasRosterLock) {
      setMoveError("Acquire the roster lock to make changes.");
      return false;
    }

    return confirmAdminPastDates(cells.map((cell) => cell.date));
  };

  const confirmAdminPastDates = (targetDates: string[]) => {
    if (user?.role !== "ADMIN") {
      return true;
    }

    const pastDates = Array.from(new Set(targetDates.filter((targetDate) => targetDate < todayKey())));
    if (pastDates.length === 0) {
      return true;
    }

    return window.confirm(`You are changing previous roster date${pastDates.length === 1 ? "" : "s"}: ${pastDates.join(", ")}. Continue?`);
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
        </div>
      </header>
      {rosterQuery.isLoading && <div className="skeleton-panel" />}
      {canEditDate && !lockUnavailable && !hasRosterLock && user?.role !== "VIEWER" && (
        <div className="form-error">
          <span>
            {rosterLockedByOther && lockState?.lock
              ? `${lockState.lock.lockedByName} is editing this roster. Acquire the lock to end their edit session and make changes.`
              : lockError ?? "Acquire the roster lock to make changes."}
          </span>
          <button
            className="link-button"
            type="button"
            onClick={() => {
              if (rosterLockedByOther) {
                stealLockMutation.mutate();
                return;
              }
              void requestRosterLock();
            }}
            disabled={lockBusy || stealLockMutation.isPending}
          >
            Acquire lock
          </button>
        </div>
      )}
      {rosterQuery.isError && (
        <div className="form-error">
          Roster could not be loaded.
          <button className="link-button" type="button" onClick={() => void rosterQuery.refetch()}>
            Retry
          </button>
        </div>
      )}
      {moveError && <div className="form-error">{moveError}</div>}
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
          canEdit={canEditDailyRoster}
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
      {modal && <ShiftModal state={modal} employees={employees} departments={departments} onClose={() => setModal(null)} onBeforeMutation={beforeShiftMutation} />}
    </section>
  );
}

function dateKey(iso: string) {
  return iso.slice(0, 10);
}

function isMissingLockEndpoint(error: unknown) {
  return error instanceof ApiError && error.body.statusCode === 404 && String(error.body.message ?? "").includes("/roster/lock");
}

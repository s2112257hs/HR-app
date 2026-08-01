import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronsLeft, ChevronsRight, Download, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { removeDayMarker, setDayMarker } from "../../api/dayMarkers";
import { fetchDepartments } from "../../api/departments";
import { fetchEmployees } from "../../api/employees";
import {
  acquireRosterLock,
  clearWeeklyCells,
  copyWeeklyCell,
  createShift,
  deleteShift,
  fetchWeeklyRoster,
  heartbeatRosterLock,
  releaseRosterLock,
  restoreWeeklyCells,
  stealRosterLock,
  validateWeeklyRoster,
  type CopyWeeklyCellPayload,
  type WeeklyCellKey,
  type WeeklyCellSnapshot
} from "../../api/roster";
import { useAuth } from "../authentication/AuthProvider";
import { WeeklyRosterGrid } from "./components/WeeklyRosterGrid";
import { ShiftModal, ShiftModalState } from "./components/ShiftModal";
import { addDateDays, getSevenDates, shiftAppearsOnWeeklyDate, todayKey } from "./utilities/dates";
import { canEditRosterDate } from "../../utilities/permissions";
import { DayMarker, DayMarkerType, RosterEmployee, RosterLockResponse, RosterValidationResponse, Shift } from "../../types/api";
import { friendlyApiMessage } from "../../utilities/formErrors";
import { useEffect, useRef, useState } from "react";

type DayMarkerModalState = {
  employee: RosterEmployee;
  date: string;
  marker: DayMarker;
};

type PendingCellReplace = {
  payload: CopyWeeklyCellPayload;
  targetCells: NonNullable<ApiError["body"]["targetCells"]>;
};

type PdfValidationDialog = {
  validation: RosterValidationResponse;
  canProceed: boolean;
};

type UndoSnapshot = {
  label: string;
  cells: WeeklyCellSnapshot[];
};

export function WeeklyRosterPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const requestedStartDate = searchParams.get("startDate") ?? todayKey();
  const [modal, setModal] = useState<ShiftModalState | null>(null);
  const [dayMarkerModal, setDayMarkerModal] = useState<DayMarkerModalState | null>(null);
  const [markerType, setMarkerType] = useState<DayMarkerType>("RDO");
  const [markerNotes, setMarkerNotes] = useState("");
  const [dayMarkerError, setDayMarkerError] = useState<string | null>(null);
  const [pendingCellReplace, setPendingCellReplace] = useState<PendingCellReplace | null>(null);
  const [pdfValidationDialog, setPdfValidationDialog] = useState<PdfValidationDialog | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pdfPending, setPdfPending] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [pendingSelectedDelete, setPendingSelectedDelete] = useState<WeeklyCellKey[] | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<UndoSnapshot | null>(null);
  const [lockState, setLockState] = useState<RosterLockResponse | null>(null);
  const [lockError, setLockError] = useState<string | null>(null);
  const [lockUnavailable, setLockUnavailable] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);
  const releaseLockOnUnmount = useRef(false);
  const rosterQuery = useQuery({
    queryKey: ["roster", "weekly", requestedStartDate],
    queryFn: () => fetchWeeklyRoster(requestedStartDate)
  });
  const employeesQuery = useQuery({
    queryKey: ["employees", "active"],
    queryFn: () => fetchEmployees("active")
  });
  const departmentsQuery = useQuery({
    queryKey: ["departments", "active"],
    queryFn: () => fetchDepartments("active")
  });

  const setStartDate = (date: string) => setSearchParams({ startDate: date }, { replace: true });
  const employees = employeesQuery.data ?? [];
  const departments = departmentsQuery.data ?? [];
  const weekStartDate = rosterQuery.data?.startDate ?? requestedStartDate;
  const dates = rosterQuery.data?.dates ?? getSevenDates(weekStartDate);
  const hasRosterLock = Boolean(lockState?.locked && lockState.lock?.lockedByUserId === user?.id);
  const rosterLockedByOther = Boolean(lockState?.locked && lockState.lock?.lockedByUserId !== user?.id);
  const canEditWeeklyRoster = lockUnavailable || hasRosterLock;

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
    if (!dayMarkerModal) {
      return;
    }

    setMarkerType(dayMarkerModal.marker.type);
    setMarkerNotes(dayMarkerModal.marker.notes ?? "");
    setDayMarkerError(null);
  }, [dayMarkerModal]);

  useEffect(() => {
    if (rosterQuery.data?.startDate && rosterQuery.data.startDate !== requestedStartDate) {
      setStartDate(rosterQuery.data.startDate);
    }
  }, [rosterQuery.data?.startDate, requestedStartDate]);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoLatestChange();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  const setDayMarkerMutation = useMutation({
    mutationFn: setDayMarker,
    onSuccess: async () => {
      setDayMarkerModal(null);
      setDayMarkerError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["roster"] }),
        queryClient.invalidateQueries({ queryKey: ["rdo-tracker"] })
      ]);
    },
    onError: (error) => {
      setDayMarkerError(friendlyApiMessage(error, "Day marker could not be saved."));
    }
  });
  const clearWeeklyCellsMutation = useMutation({
    mutationFn: async (cells: WeeklyCellKey[]) => {
      try {
        return await clearWeeklyCells(cells);
      } catch (error) {
        if (isMissingBulkEndpoint(error)) {
          return clearWeeklyCellsWithExistingApis(cells);
        }
        throw error;
      }
    },
    onSuccess: async () => {
      setPendingSelectedDelete(null);
      setSelectedCells(new Set());
      setSelectMode(false);
      setDayMarkerError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["roster"] }),
        queryClient.invalidateQueries({ queryKey: ["rdo-tracker"] })
      ]);
    },
    onError: (error) => {
      setDayMarkerError(backendFeatureMessage(error, "Selected cells could not be deleted."));
    }
  });
  const restoreWeeklyCellsMutation = useMutation({
    mutationFn: async (cells: WeeklyCellSnapshot[]) => {
      try {
        return await restoreWeeklyCells(cells);
      } catch (error) {
        if (isMissingBulkEndpoint(error)) {
          return restoreWeeklyCellsWithExistingApis(cells);
        }
        throw error;
      }
    },
    onSuccess: async () => {
      setUndoSnapshot(null);
      setDayMarkerError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["roster"] }),
        queryClient.invalidateQueries({ queryKey: ["rdo-tracker"] })
      ]);
    },
    onError: (error) => {
      setDayMarkerError(backendFeatureMessage(error, "Latest change could not be undone."));
    }
  });
  const stealLockMutation = useMutation({
    mutationFn: stealRosterLock,
    onSuccess: (state) => {
      applyRosterLock(state);
    },
    onError: (error) => setLockError(friendlyApiMessage(error, "Roster lock could not be taken."))
  });
  const removeDayMarkerMutation = useMutation({
    mutationFn: removeDayMarker,
    onSuccess: async () => {
      setDayMarkerModal(null);
      setDayMarkerError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["roster"] }),
        queryClient.invalidateQueries({ queryKey: ["rdo-tracker"] })
      ]);
    },
    onError: (error) => {
      setDayMarkerError(friendlyApiMessage(error, "Day marker could not be removed."));
    }
  });
  const copyWeeklyCellMutation = useMutation({
    mutationFn: copyWeeklyCell,
    onSuccess: async () => {
      setPendingCellReplace(null);
      setDayMarkerError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["roster"] }),
        queryClient.invalidateQueries({ queryKey: ["rdo-tracker"] })
      ]);
    },
    onError: (error, payload) => {
      if (error instanceof ApiError && error.body.error === "WEEKLY_CELL_REPLACE_CONFIRMATION") {
        setPendingCellReplace({ payload, targetCells: error.body.targetCells ?? [] });
        setDayMarkerError(null);
        return;
      }

      setDayMarkerError(friendlyApiMessage(error, "Cell could not be copied."));
    }
  });

  const downloadCurrentPdf = async () => {
    if (!rosterQuery.data) {
      return;
    }
    const { downloadWeeklyRosterPdf } = await import("./utilities/weeklyPdf");
    downloadWeeklyRosterPdf(rosterQuery.data, { darkMode: document.documentElement.dataset.theme === "dark" });
  };

  const downloadPdf = async () => {
    if (!rosterQuery.data) {
      return;
    }

    setPdfError(null);
    setPdfPending(true);
    try {
      const validation = await validateWeeklyRoster(weekStartDate);
      if (validation.valid) {
        await downloadCurrentPdf();
        return;
      }

      setPdfValidationDialog({ validation, canProceed: user?.role === "ADMIN" });
    } catch (error) {
      setPdfError(friendlyApiMessage(error, "Roster validation could not be checked."));
    } finally {
      setPdfPending(false);
    }
  };

  const toggleCellSelection = (employeeId: string, date: string) => {
    const key = cellKey(employeeId, date);
    setSelectedCells((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectAllCells = () => {
    setSelectMode(true);
    const editableDates = dates.filter((date) => canEditWeeklyRoster && canEditRosterDate(user, date));
    setSelectedCells(new Set((rosterQuery.data?.employees ?? []).flatMap((employee) => editableDates.map((date) => cellKey(employee.id, date)))));
  };

  const selectedCellList = () =>
    Array.from(selectedCells).map((key) => {
      const [employeeId, date] = key.split("|");
      return { employeeId, date };
    });

  const clearWeeklyCellsWithExistingApis = async (cells: WeeklyCellKey[]) => {
    const seenMarkers = new Set<string>();
    const seenShifts = new Set<string>();

    for (const cell of cells) {
      const employee = (rosterQuery.data?.employees ?? []).find((item) => item.id === cell.employeeId);
      if (!employee) {
        continue;
      }

      const marker = employee.dayMarkers.find((item) => item.date === cell.date);
      if (marker && !seenMarkers.has(marker.id)) {
        seenMarkers.add(marker.id);
        await removeDayMarker(marker.id);
      }

      if (!marker) {
        const shifts = employee.shifts.filter((shift) => shiftAppearsOnDate(shift, cell.date));
        for (const shift of shifts) {
          if (seenShifts.has(shift.id)) {
            continue;
          }
          seenShifts.add(shift.id);
          await deleteShift(shift.id);
        }
      }
    }

    return { clearedCount: cells.length };
  };

  const restoreWeeklyCellsWithExistingApis = async (cells: WeeklyCellSnapshot[]) => {
    await clearWeeklyCellsWithExistingApis(cells.map((cell) => ({ employeeId: cell.employeeId, date: cell.date })));

    for (const cell of cells) {
      if (cell.marker) {
        await setDayMarker({
          employeeId: cell.employeeId,
          date: cell.date,
          type: cell.marker.type,
          notes: cell.marker.notes ?? null
        });
        continue;
      }

      for (const shift of cell.shifts) {
        await createShift({
          employeeId: cell.employeeId,
          departmentId: shift.departmentId,
          startAt: shift.startAt,
          endAt: shift.endAt,
          unpaidBreakMinutes: shift.unpaidBreakMinutes,
          overtimeMinutes: shift.overtimeMinutes ?? 0,
          notes: shift.notes ?? null,
          overlapAcknowledged: true
        });
      }
    }

    return { restoredCount: cells.length };
  };

  const prepareWeeklyChange = (cells: WeeklyCellKey[], label: string) => {
    if (!confirmAdminPastDates(cells.map((cell) => cell.date))) {
      return false;
    }

    const snapshot = snapshotWeeklyCells(cells, rosterQuery.data?.employees ?? []);
    if (snapshot.length > 0) {
      setUndoSnapshot({ label, cells: snapshot });
    }
    return true;
  };

  const setMarkerWithUndo = (employeeId: string, date: string, type: DayMarkerType) => {
    const cells = [{ employeeId, date }];
    if (!prepareWeeklyChange(cells, `Set ${type}`)) {
      return;
    }
    setDayMarkerMutation.mutate({ employeeId, date, type });
  };

  const deleteSelectedCells = () => {
    const cells = selectedCellList();
    if (cells.length === 0) {
      return;
    }
    setPendingSelectedDelete(cells);
  };

  const confirmDeleteSelectedCells = () => {
    const cells = pendingSelectedDelete ?? [];
    if (cells.length === 0 || !prepareWeeklyChange(cells, "Delete selected cells")) {
      return;
    }
    setPendingSelectedDelete(null);
    clearWeeklyCellsMutation.mutate(cells);
  };

  const undoLatestChange = () => {
    if (!undoSnapshot || restoreWeeklyCellsMutation.isPending) {
      return;
    }
    restoreWeeklyCellsMutation.mutate(undoSnapshot.cells);
  };

  const copyWeeklyCellWithUndo = (employeeId: string, sourceDate: string, targetStartDate: string, targetEndDate: string) => {
    const targetDates = dateRange(targetStartDate, targetEndDate);
    const cells = targetDates.map((date) => ({ employeeId, date }));
    if (!prepareWeeklyChange(cells, "Copy weekly cell")) {
      return;
    }
    copyWeeklyCellMutation.mutate({ employeeId, sourceDate, targetStartDate, targetEndDate });
  };

  const beforeShiftMutation = (cells: WeeklyCellKey[]) => prepareWeeklyChange(cells, "Shift change");

  const confirmAdminPastDates = (targetDates: string[]) => {
    if (user?.role !== "ADMIN") {
      return true;
    }

    const pastDates = Array.from(new Set(targetDates.filter((date) => date < todayKey())));
    if (pastDates.length === 0) {
      return true;
    }

    return window.confirm(`You are changing previous roster date${pastDates.length === 1 ? "" : "s"}: ${pastDates.join(", ")}. Continue?`);
  };
  const pendingDeleteDates = pendingSelectedDelete ? Array.from(new Set(pendingSelectedDelete.map((cell) => cell.date))).sort() : [];
  const rosterActionPending =
    setDayMarkerMutation.isPending ||
    clearWeeklyCellsMutation.isPending ||
    restoreWeeklyCellsMutation.isPending ||
    removeDayMarkerMutation.isPending ||
    copyWeeklyCellMutation.isPending;

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>Weekly roster</h1>
          <p>
            {dates[0]} to {rosterQuery.data?.endDateExclusive ?? dates[6]}
          </p>
        </div>
        <div className="toolbar">
          <button className="icon-button" type="button" onClick={() => setStartDate(addDateDays(weekStartDate, -7))} aria-label="Previous week">
            <ChevronsLeft size={18} aria-hidden="true" />
          </button>
          <button className="secondary-button" type="button" onClick={() => setStartDate(todayKey())}>
            <RotateCcw size={16} aria-hidden="true" />
            Today
          </button>
          <button className="icon-button" type="button" onClick={() => setStartDate(addDateDays(weekStartDate, 7))} aria-label="Next week">
            <ChevronsRight size={18} aria-hidden="true" />
          </button>
          <input type="date" value={weekStartDate} onChange={(event) => setStartDate(event.target.value)} />
          <button className="secondary-button" type="button" onClick={() => void downloadPdf()} disabled={!rosterQuery.data || pdfPending}>
            <Download size={16} aria-hidden="true" />
            {pdfPending ? "Checking..." : "PDF"}
          </button>
          <button className="secondary-button" type="button" onClick={undoLatestChange} disabled={!undoSnapshot || restoreWeeklyCellsMutation.isPending || !canEditWeeklyRoster}>
            <Undo2 size={16} aria-hidden="true" />
            {restoreWeeklyCellsMutation.isPending ? "Undoing..." : "Undo"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setSelectMode((value) => !value);
              setSelectedCells(new Set());
            }}
            disabled={!canEditWeeklyRoster || rosterActionPending}
          >
            {selectMode ? "Cancel select" : "Select cells"}
          </button>
          <button className="secondary-button" type="button" onClick={selectAllCells} disabled={!canEditWeeklyRoster || !rosterQuery.data || rosterActionPending}>
            Select all
          </button>
          <button className="danger-button" type="button" onClick={deleteSelectedCells} disabled={!canEditWeeklyRoster || selectedCells.size === 0 || rosterActionPending}>
            <Trash2 size={16} aria-hidden="true" />
            {clearWeeklyCellsMutation.isPending ? "Deleting..." : "Delete selected"}
          </button>
        </div>
      </header>
      {!lockUnavailable && !hasRosterLock && user?.role !== "VIEWER" && (
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
            {lockBusy || stealLockMutation.isPending ? "Acquiring..." : "Acquire lock"}
          </button>
        </div>
      )}
      {undoSnapshot && <div className="form-success">Latest undo point: {undoSnapshot.label}. Press Ctrl+Z or use Undo.</div>}
      {rosterQuery.isLoading && <div className="skeleton-panel" />}
      {rosterQuery.isError && (
        <div className="form-error">
          Roster could not be loaded.
          <button className="link-button" type="button" onClick={() => void rosterQuery.refetch()}>
            Retry
          </button>
        </div>
      )}
      {rosterQuery.data && (
        <WeeklyRosterGrid
          dates={dates}
          employees={rosterQuery.data.employees}
          onCreateShift={(employeeId, date) => setModal({ mode: "create", employeeId, date })}
          onEditShift={(employeeId, shift) => setModal({ mode: "edit", employeeId, shift })}
          onSetDayMarker={setMarkerWithUndo}
          onEditDayMarker={(employee, date, marker) => setDayMarkerModal({ employee, date, marker })}
          onCopyCell={copyWeeklyCellWithUndo}
          onOpenDate={(date) => navigate(`/roster/daily?date=${encodeURIComponent(date)}`)}
          canEditDate={(date) => canEditWeeklyRoster && !rosterActionPending && canEditRosterDate(user, date)}
          selectMode={selectMode}
          selectedCells={selectedCells}
          onToggleCellSelection={toggleCellSelection}
        />
      )}
      {modal && <ShiftModal state={modal} employees={employees} departments={departments} onClose={() => setModal(null)} onBeforeMutation={beforeShiftMutation} />}
      {dayMarkerError && <div className="form-error">{dayMarkerError}</div>}
      {pdfError && <div className="form-error">{pdfError}</div>}
      {pendingSelectedDelete && (
        <div className="modal-backdrop" role="presentation">
          <div className="dialog-panel warning-dialog" role="dialog" aria-modal="true">
            <div className="dialog-heading">
              <h2>Delete selected cells?</h2>
            </div>
            <p className="dialog-note">
              This will delete roster data from {pendingSelectedDelete.length} selected cell{pendingSelectedDelete.length === 1 ? "" : "s"}. You can use Undo after deletion.
            </p>
            <div className="validation-list">
              <div className="validation-item">
                <strong>Affected dates</strong>
                <span>{pendingDeleteDates.join(", ")}</span>
              </div>
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setPendingSelectedDelete(null)}>
                Cancel
              </button>
              <button className="danger-button" type="button" onClick={confirmDeleteSelectedCells} disabled={clearWeeklyCellsMutation.isPending}>
                <Trash2 size={16} aria-hidden="true" />
                {clearWeeklyCellsMutation.isPending ? "Deleting..." : "Delete selected"}
              </button>
            </div>
          </div>
        </div>
      )}
      {pendingCellReplace && (
        <div className="modal-backdrop" role="presentation">
          <div className="dialog-panel warning-dialog" role="dialog" aria-modal="true">
            <div className="dialog-heading">
              <h2>Paste anyway?</h2>
            </div>
            <p className="dialog-note">There is data in the selected target cells. It will be deleted before the copied cell is pasted.</p>
            <div className="validation-list">
              {pendingCellReplace.targetCells.map((cell) => (
                <div className="validation-item" key={cell.date}>
                  <strong>{cell.date}</strong>
                  <span>{cell.markerType ? cell.markerType : `${cell.shiftCount} shift${cell.shiftCount === 1 ? "" : "s"}`}</span>
                </div>
              ))}
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setPendingCellReplace(null)}>
                Cancel
              </button>
              <button
                className="danger-button"
                type="button"
                onClick={() => copyWeeklyCellMutation.mutate({ ...pendingCellReplace.payload, replaceExisting: true })}
                disabled={copyWeeklyCellMutation.isPending}
              >
                {copyWeeklyCellMutation.isPending ? "Pasting..." : "Delete and paste"}
              </button>
            </div>
          </div>
        </div>
      )}
      {pdfValidationDialog && (
        <div className="modal-backdrop" role="presentation">
          <div className="dialog-panel warning-dialog" role="dialog" aria-modal="true">
            <div className="dialog-heading">
              <h2>Validation rules not met</h2>
            </div>
            <p className="dialog-note">
              {pdfValidationDialog.canProceed
                ? "The roster does not meet every validation rule. Admins can download anyway after reviewing the warnings."
                : "The roster does not meet every validation rule. Managers cannot download the PDF until these are fixed."}
            </p>
            <div className="validation-list">
              {pdfValidationDialog.validation.violations.map((violation) => (
                <div className="validation-item" key={`${violation.ruleId}-${violation.date}`}>
                  <strong>
                    {violation.date} - {violation.ruleName}
                  </strong>
                  <span>
                    {violation.department.shortCode} needs {violation.minimumStaff} from {violation.startTime} to {violation.endTime}; found{" "}
                    {violation.actualMinimumStaff} around {violation.firstShortfallStart}-{violation.firstShortfallEnd}.
                  </span>
                </div>
              ))}
            </div>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setPdfValidationDialog(null)}>
                {pdfValidationDialog.canProceed ? "Cancel" : "Close"}
              </button>
              {pdfValidationDialog.canProceed && (
                <button
                  className="primary-button"
                  type="button"
                  onClick={async () => {
                    setPdfPending(true);
                    try {
                      setPdfValidationDialog(null);
                      await downloadCurrentPdf();
                    } finally {
                      setPdfPending(false);
                    }
                  }}
                  disabled={pdfPending}
                >
                  {pdfPending ? "Downloading..." : "Download anyway"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      {dayMarkerModal && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="dialog-panel shift-modal"
            role="dialog"
            aria-modal="true"
            onSubmit={(event) => {
              event.preventDefault();
              const cell = { employeeId: dayMarkerModal.employee.id, date: dayMarkerModal.date };
              if (prepareWeeklyChange([cell], `Set ${markerType}`)) {
                setDayMarkerMutation.mutate({
                  employeeId: dayMarkerModal.employee.id,
                  date: dayMarkerModal.date,
                  type: markerType,
                  notes: markerNotes
                });
              }
            }}
          >
            <div className="modal-title-row">
              <h2>Day marker</h2>
            </div>
            <p className="dialog-note">
              {dayMarkerModal.employee.displayName} on {dayMarkerModal.date}
            </p>
            <div className="form-grid">
              <label>
                Type
                <select value={markerType} onChange={(event) => setMarkerType(event.target.value as DayMarkerType)}>
                  <option value="RDO">RDO</option>
                  <option value="LEAVE">LEAVE</option>
                  <option value="SICK">SICK</option>
                </select>
              </label>
            </div>
            <label>
              Notes
              <textarea rows={3} value={markerNotes} onChange={(event) => setMarkerNotes(event.target.value)} />
            </label>
            {dayMarkerError && <div className="form-error">{dayMarkerError}</div>}
            <div className="dialog-actions split">
              <button
                className="danger-button"
                type="button"
                onClick={() => {
                  if (prepareWeeklyChange([{ employeeId: dayMarkerModal.employee.id, date: dayMarkerModal.date }], "Remove day marker")) {
                    removeDayMarkerMutation.mutate(dayMarkerModal.marker.id);
                  }
                }}
                disabled={removeDayMarkerMutation.isPending}
              >
                {removeDayMarkerMutation.isPending ? "Removing..." : "Remove"}
              </button>
              <div className="right-actions">
                <button className="secondary-button" type="button" onClick={() => setDayMarkerModal(null)}>
                  Close
                </button>
                <button className="primary-button" type="submit" disabled={setDayMarkerMutation.isPending}>
                  {setDayMarkerMutation.isPending ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function cellKey(employeeId: string, date: string) {
  return `${employeeId}|${date}`;
}

function snapshotWeeklyCells(cells: WeeklyCellKey[], employees: RosterEmployee[]) {
  const seenCellKeys = new Set<string>();
  const seenShiftIds = new Set<string>();
  const snapshots: WeeklyCellSnapshot[] = [];

  for (const cell of cells) {
    const key = cellKey(cell.employeeId, cell.date);
    if (seenCellKeys.has(key)) {
      continue;
    }
    seenCellKeys.add(key);

    const employee = employees.find((item) => item.id === cell.employeeId);
    if (!employee) {
      continue;
    }

    const marker = employee.dayMarkers.find((item) => item.date === cell.date);
    const shifts = marker
      ? []
      : employee.shifts
          .filter((shift) => shiftAppearsOnDate(shift, cell.date))
          .filter((shift) => {
            if (seenShiftIds.has(shift.id)) {
              return false;
            }
            seenShiftIds.add(shift.id);
            return true;
          })
          .map((shift) => ({
            departmentId: shift.departmentId ?? shift.department.id,
            startAt: shift.startAt,
            endAt: shift.endAt,
            unpaidBreakMinutes: shift.unpaidBreakMinutes,
            overtimeMinutes: shift.overtimeMinutes ?? 0,
            notes: shift.notes ?? null
          }));

    snapshots.push({
      employeeId: cell.employeeId,
      date: cell.date,
      marker: marker ? { type: marker.type, notes: marker.notes ?? null } : null,
      shifts
    });
  }

  return snapshots;
}

function shiftAppearsOnDate(shift: Shift, date: string) {
  return shiftAppearsOnWeeklyDate(shift, date);
}

function dateRange(startDate: string, endDate: string) {
  const dates: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addDateDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

function isMissingLockEndpoint(error: unknown) {
  return error instanceof ApiError && error.body.statusCode === 404 && String(error.body.message ?? "").includes("/roster/lock");
}

function isMissingBulkEndpoint(error: unknown) {
  return (
    error instanceof ApiError &&
    error.body.statusCode === 404 &&
    (String(error.body.message ?? "").includes("/roster/weekly-cells-clear") ||
      String(error.body.message ?? "").includes("/roster/weekly-cells-restore"))
  );
}

function backendFeatureMessage(error: unknown, fallback: string) {
  if (isMissingBulkEndpoint(error)) {
    return "The weekly undo/delete API route returned 404.";
  }

  return friendlyApiMessage(error, fallback);
}

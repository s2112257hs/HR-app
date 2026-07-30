import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Download, RotateCcw } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ApiError } from "../../api/client";
import { removeDayMarker, setDayMarker } from "../../api/dayMarkers";
import { fetchDepartments } from "../../api/departments";
import { fetchEmployees } from "../../api/employees";
import { copyWeeklyCell, fetchWeeklyRoster, validateWeeklyRoster, type CopyWeeklyCellPayload } from "../../api/roster";
import { useAuth } from "../authentication/AuthProvider";
import { WeeklyRosterGrid } from "./components/WeeklyRosterGrid";
import { ShiftModal, ShiftModalState } from "./components/ShiftModal";
import { addDateDays, getSevenDates, todayKey } from "./utilities/dates";
import { canEditRosterDate } from "../../utilities/permissions";
import { DayMarker, DayMarkerType, RosterEmployee, RosterValidationResponse } from "../../types/api";
import { friendlyApiMessage } from "../../utilities/formErrors";
import { useEffect, useState } from "react";

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

export function WeeklyRosterPage() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const startDate = searchParams.get("startDate") ?? todayKey();
  const [modal, setModal] = useState<ShiftModalState | null>(null);
  const [dayMarkerModal, setDayMarkerModal] = useState<DayMarkerModalState | null>(null);
  const [markerType, setMarkerType] = useState<DayMarkerType>("RDO");
  const [markerNotes, setMarkerNotes] = useState("");
  const [dayMarkerError, setDayMarkerError] = useState<string | null>(null);
  const [pendingCellReplace, setPendingCellReplace] = useState<PendingCellReplace | null>(null);
  const [pdfValidationDialog, setPdfValidationDialog] = useState<PdfValidationDialog | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const rosterQuery = useQuery({
    queryKey: ["roster", "weekly", startDate],
    queryFn: () => fetchWeeklyRoster(startDate)
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
  const dates = rosterQuery.data?.dates ?? getSevenDates(startDate);
  useEffect(() => {
    if (!dayMarkerModal) {
      return;
    }

    setMarkerType(dayMarkerModal.marker.type);
    setMarkerNotes(dayMarkerModal.marker.notes ?? "");
    setDayMarkerError(null);
  }, [dayMarkerModal]);

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
    try {
      const validation = await validateWeeklyRoster(startDate);
      if (validation.valid) {
        await downloadCurrentPdf();
        return;
      }

      setPdfValidationDialog({ validation, canProceed: user?.role === "ADMIN" });
    } catch (error) {
      setPdfError(friendlyApiMessage(error, "Roster validation could not be checked."));
    }
  };

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
          <button className="icon-button" type="button" onClick={() => setStartDate(addDateDays(startDate, -7))} aria-label="Previous seven days">
            <ChevronsLeft size={18} aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" onClick={() => setStartDate(addDateDays(startDate, -1))} aria-label="Previous day">
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
          <button className="secondary-button" type="button" onClick={() => setStartDate(todayKey())}>
            <RotateCcw size={16} aria-hidden="true" />
            Today
          </button>
          <button className="icon-button" type="button" onClick={() => setStartDate(addDateDays(startDate, 1))} aria-label="Next day">
            <ChevronRight size={18} aria-hidden="true" />
          </button>
          <button className="icon-button" type="button" onClick={() => setStartDate(addDateDays(startDate, 7))} aria-label="Next seven days">
            <ChevronsRight size={18} aria-hidden="true" />
          </button>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          <button className="secondary-button" type="button" onClick={() => void downloadPdf()} disabled={!rosterQuery.data}>
            <Download size={16} aria-hidden="true" />
            PDF
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
      {rosterQuery.data && (
        <WeeklyRosterGrid
          dates={dates}
          employees={rosterQuery.data.employees}
          onCreateShift={(employeeId, date) => setModal({ mode: "create", employeeId, date })}
          onEditShift={(employeeId, shift) => setModal({ mode: "edit", employeeId, shift })}
          onSetDayMarker={(employeeId, date, type) => setDayMarkerMutation.mutate({ employeeId, date, type })}
          onEditDayMarker={(employee, date, marker) => setDayMarkerModal({ employee, date, marker })}
          onCopyCell={(employeeId, sourceDate, targetStartDate, targetEndDate) =>
            copyWeeklyCellMutation.mutate({ employeeId, sourceDate, targetStartDate, targetEndDate })
          }
          onOpenDate={(date) => navigate(`/roster/daily?date=${encodeURIComponent(date)}`)}
          canEditDate={(date) => canEditRosterDate(user, date)}
        />
      )}
      {modal && <ShiftModal state={modal} employees={employees} departments={departments} onClose={() => setModal(null)} />}
      {dayMarkerError && <div className="form-error">{dayMarkerError}</div>}
      {pdfError && <div className="form-error">{pdfError}</div>}
      {pendingCellReplace && (
        <div className="modal-backdrop" role="presentation">
          <div className="dialog-panel warning-dialog" role="dialog" aria-modal="true">
            <div className="dialog-heading">
              <h2>Replace target cells?</h2>
            </div>
            <p className="dialog-note">These target cells already contain roster data. They must be deleted before the copied cell can be pasted.</p>
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
                Delete and paste
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
                    setPdfValidationDialog(null);
                    await downloadCurrentPdf();
                  }}
                >
                  Download anyway
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
              setDayMarkerMutation.mutate({
                employeeId: dayMarkerModal.employee.id,
                date: dayMarkerModal.date,
                type: markerType,
                notes: markerNotes
              });
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
                onClick={() => removeDayMarkerMutation.mutate(dayMarkerModal.marker.id)}
                disabled={removeDayMarkerMutation.isPending}
              >
                Remove
              </button>
              <div className="right-actions">
                <button className="secondary-button" type="button" onClick={() => setDayMarkerModal(null)}>
                  Close
                </button>
                <button className="primary-button" type="submit" disabled={setDayMarkerMutation.isPending}>
                  Save
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

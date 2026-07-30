import { Plus } from "lucide-react";
import { useState } from "react";
import type { CSSProperties, PointerEvent } from "react";
import { DayMarker, DayMarkerType, RosterEmployee, Shift } from "../../../types/api";
import { dateKeyFromIso, dateLabel } from "../utilities/dates";
import { WeeklyShiftLine } from "./WeeklyShiftLine";

type Props = {
  dates: string[];
  employees: RosterEmployee[];
  onCreateShift: (employeeId: string, date: string) => void;
  onEditShift: (employeeId: string, shift: Shift) => void;
  onSetDayMarker: (employeeId: string, date: string, type: DayMarkerType) => void;
  onEditDayMarker: (employee: RosterEmployee, date: string, marker: DayMarker) => void;
  onCopyCell: (employeeId: string, sourceDate: string, targetStartDate: string, targetEndDate: string) => void;
  onOpenDate: (date: string) => void;
  canEditDate: (date: string) => boolean;
};

type FillDrag = {
  employeeId: string;
  sourceDate: string;
  targetDate: string;
};

export function WeeklyRosterGrid({
  dates,
  employees,
  onCreateShift,
  onEditShift,
  onSetDayMarker,
  onEditDayMarker,
  onCopyCell,
  onOpenDate,
  canEditDate
}: Props) {
  const [fillDrag, setFillDrag] = useState<FillDrag | null>(null);

  function targetDateFromPointer(clientX: number, row: HTMLElement) {
    const employeeCell = row.querySelector<HTMLElement>(".employee-cell");
    const rowRect = row.getBoundingClientRect();
    const gridLeft = employeeCell?.getBoundingClientRect().right ?? rowRect.left;
    const gridWidth = rowRect.right - gridLeft;
    const index = Math.min(dates.length - 1, Math.max(0, Math.floor(((clientX - gridLeft) / gridWidth) * dates.length)));
    return dates[index];
  }

  function updateFillDrag(event: PointerEvent<HTMLElement>, drag: FillDrag) {
    const row = event.currentTarget.closest<HTMLElement>(".weekly-row");
    if (!row) {
      return;
    }

    const nextTarget = targetDateFromPointer(event.clientX, row);
    setFillDrag({ ...drag, targetDate: nextTarget });
  }

  function finishFillDrag(drag: FillDrag) {
    const sourceIndex = dates.indexOf(drag.sourceDate);
    const targetIndex = dates.indexOf(drag.targetDate);
    setFillDrag(null);

    if (sourceIndex < 0 || targetIndex <= sourceIndex) {
      return;
    }

    onCopyCell(drag.employeeId, drag.sourceDate, dates[sourceIndex + 1], dates[targetIndex]);
  }

  return (
    <div className="weekly-grid-shell">
      <div className="weekly-header-row">
        <div className="employee-header">Employee</div>
        {dates.map((date) => (
          <div className="weekly-date-header" key={date}>
            <button className="weekly-date-button" type="button" onClick={() => onOpenDate(date)}>
              {dateLabel(date)}
            </button>
          </div>
        ))}
      </div>
      {employees.map((employee) => (
        <div className="weekly-row" key={employee.id}>
          <div className="employee-cell" style={{ "--primary-department-colour": employee.primaryDepartment?.colourHex ?? "transparent" } as CSSProperties}>
            <strong>{employee.displayName}</strong>
          </div>
          {dates.map((date) => {
            const marker = employee.dayMarkers.find((marker) => marker.date === date);
            const shifts = employee.shifts
              .filter((shift) => shiftAppearsOnDate(shift, date))
              .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
            const editable = canEditDate(date);
            const dateIndex = dates.indexOf(date);
            const sourceIndex = fillDrag?.employeeId === employee.id ? dates.indexOf(fillDrag.sourceDate) : -1;
            const fillTargetIndex = fillDrag?.employeeId === employee.id ? dates.indexOf(fillDrag.targetDate) : -1;
            const fillHighlighted = sourceIndex >= 0 && dateIndex > sourceIndex && dateIndex <= fillTargetIndex;
            const canCopyCell = editable && dateIndex < dates.length - 1 && Boolean(marker || shifts.length > 0);

            return (
              <div
                className={`weekly-cell ${editable ? "" : "locked"} ${marker ? "has-day-marker" : ""} ${fillHighlighted ? "fill-target" : ""}`}
                key={`${employee.id}-${date}`}
                role={editable && !marker ? "button" : undefined}
                tabIndex={editable && !marker ? 0 : undefined}
                onClick={() => {
                  if (editable && !marker) {
                    onCreateShift(employee.id, date);
                  }
                }}
                onKeyDown={(event) => {
                  if (editable && !marker && event.key === "Enter") {
                    onCreateShift(employee.id, date);
                  }
                }}
              >
                {marker ? (
                  <button
                    className={`day-marker-block ${marker.type.toLowerCase()}`}
                    type="button"
                    title={marker.type === "RDO" ? "Roster day off" : "Leave"}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (editable) {
                        onEditDayMarker(employee, date, marker);
                      }
                    }}
                  >
                    <strong>{marker.type}</strong>
                  </button>
                ) : null}
                {editable && !marker && (
                  <span className="cell-plus" aria-label="Add shift">
                    <Plus size={15} aria-hidden="true" />
                  </span>
                )}
                {editable && !marker && (
                  <div className="weekly-marker-actions" aria-label="Day marker actions">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSetDayMarker(employee.id, date, "RDO");
                      }}
                    >
                      RDO
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSetDayMarker(employee.id, date, "LEAVE");
                      }}
                    >
                      LEAVE
                    </button>
                  </div>
                )}
                {!marker &&
                  shifts.map((shift) => (
                    <WeeklyShiftLine key={shift.id} shift={shift} date={date} onClick={() => onEditShift(employee.id, shift)} />
                  ))}
                {canCopyCell && (
                  <button
                    className="weekly-fill-handle"
                    type="button"
                    aria-label="Copy cell to later days"
                    title="Drag right to copy"
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                      event.currentTarget.setPointerCapture(event.pointerId);
                      setFillDrag({ employeeId: employee.id, sourceDate: date, targetDate: date });
                    }}
                    onPointerMove={(event) => {
                      if (fillDrag?.employeeId === employee.id && fillDrag.sourceDate === date) {
                        updateFillDrag(event, fillDrag);
                      }
                    }}
                    onPointerUp={(event) => {
                      if (fillDrag?.employeeId === employee.id && fillDrag.sourceDate === date) {
                        event.stopPropagation();
                        finishFillDrag(fillDrag);
                      }
                    }}
                    onPointerCancel={() => setFillDrag(null)}
                  />
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function shiftAppearsOnDate(shift: Shift, date: string) {
  return shift.rosterSegments ? shift.rosterSegments.some((segment) => segment.date === date) : dateKeyFromIso(shift.startAt) === date;
}

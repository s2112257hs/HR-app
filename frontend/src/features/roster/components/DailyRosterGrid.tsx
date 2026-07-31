import { DayMarker, RosterEmployee, Shift } from "../../../types/api";
import { ShiftBlock } from "./ShiftBlock";
import { clampMinutes, getGridHours, GRID_SNAP_MINUTES, minutesToTime, parseTimeToMinutes, snapMinutes, VIEW_WINDOW_MINUTES } from "../utilities/time";
import { clockLabel12 } from "../utilities/dates";
import type { CSSProperties, DragEvent, PointerEvent } from "react";
import { useState } from "react";

type DragState = {
  employeeId: string;
  startMinutes: number;
  currentMinutes: number;
};

type MovingShift = {
  shift: Shift;
  grabOffsetMinutes: number;
  durationMs: number;
};

type Props = {
  date: string;
  windowStartTime: string;
  windowStartAt?: string;
  timezone?: string;
  employees: RosterEmployee[];
  drag: DragState | null;
  setDrag: (drag: DragState | null) => void;
  onCreateShift: (employeeId: string, date: string, startTime: string, endTime: string) => void;
  onEditShift: (employeeId: string, shift: Shift) => void;
  onMoveShift: (employeeId: string, shift: Shift, startAt: string, endAt: string) => void;
  canEdit: boolean;
};

const GRID_TOTAL_MINUTES = VIEW_WINDOW_MINUTES;

export function DailyRosterGrid({ date, windowStartTime, windowStartAt, timezone, employees, drag, setDrag, onCreateShift, onEditShift, onMoveShift, canEdit }: Props) {
  const hours = getGridHours(windowStartTime).filter((_hour, index) => index % 2 === 0);
  const [movingShift, setMovingShift] = useState<MovingShift | null>(null);
  const gridStart = gridStartInstant(date, windowStartTime, windowStartAt);

  function pointerToMinutes(event: PointerEvent<HTMLElement>) {
    return snapMinutes(clientXToMinutes(event.clientX, event.currentTarget));
  }

  function clientXToMinutes(clientX: number, target: HTMLElement) {
    const rect = target.getBoundingClientRect();
    const x = clientX - rect.left;
    return clampMinutes((x / rect.width) * GRID_TOTAL_MINUTES);
  }

  function startMovingShift(event: DragEvent<HTMLButtonElement>, shift: Shift) {
    if (!canEdit) {
      return;
    }

    const timelineCell = event.currentTarget.closest<HTMLElement>(".timeline-cell");
    if (!timelineCell) {
      return;
    }

    event.stopPropagation();
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", shift.id);

    const visibleStartMinutes = Math.max(0, (new Date(shift.startAt).getTime() - gridStart.getTime()) / 60000);
    const grabOffsetMinutes = clampMinutes(clientXToMinutes(event.clientX, timelineCell) - visibleStartMinutes);

    setMovingShift({
      shift,
      grabOffsetMinutes,
      durationMs: new Date(shift.endAt).getTime() - new Date(shift.startAt).getTime()
    });
  }

  function dropMovingShift(event: DragEvent<HTMLElement>, employeeId: string) {
    if (!movingShift || !canEdit) {
      return;
    }

    event.preventDefault();
    const durationMinutes = movingShift.durationMs / 60000;
    const maxStart = Math.max(0, VIEW_WINDOW_MINUTES - durationMinutes);
    const rawStart = clientXToMinutes(event.clientX, event.currentTarget) - movingShift.grabOffsetMinutes;
    const startOffset = Math.min(maxStart, Math.max(0, snapMinutes(rawStart)));
    const startAt = instantFromWindowOffset(gridStart, startOffset);
    const endAt = new Date(startAt.getTime() + movingShift.durationMs);

    onMoveShift(employeeId, movingShift.shift, startAt.toISOString(), endAt.toISOString());
    setMovingShift(null);
  }

  return (
    <div className="daily-grid-shell">
      <div className="daily-header-row">
        <div className="employee-header">Employee</div>
        <div className="time-header">
          {hours.map((hour) => (
            <span key={hour}>{clockLabel12(hour)}</span>
          ))}
        </div>
      </div>
      <div className="daily-rows">
        {employees.map((employee) => {
          const dayMarkerSegments = employee.dayMarkers.flatMap((marker) => {
            const segment = getDayMarkerSegment(gridStart, marker);
            return segment ? [{ marker, ...segment }] : [];
          });
          const visibleShifts = employee.shifts;
          const laneMap = assignLanes(visibleShifts);
          const laneCount = Math.max(1, ...Array.from(laneMap.values()).map((lane) => lane + 1));
          const hasDayMarkers = dayMarkerSegments.length > 0;
          const timelineEditable = canEdit;
          const activeDrag = drag?.employeeId === employee.id ? drag : null;
          const selectionLeft = activeDrag ? Math.min(activeDrag.startMinutes, activeDrag.currentMinutes) : 0;
          const selectionWidth = activeDrag ? Math.abs(activeDrag.currentMinutes - activeDrag.startMinutes) : 0;

          return (
            <div className="daily-row" key={employee.id} style={{ minHeight: `${hasDayMarkers ? Math.max(72, laneCount * 32 + 18) : Math.max(56, laneCount * 32 + 18)}px` }}>
              <div className="employee-cell" style={{ "--primary-department-colour": employee.primaryDepartment?.colourHex ?? "transparent" } as CSSProperties}>
                <strong>{employee.displayName}</strong>
              </div>
              <div
                className={`timeline-cell ${timelineEditable ? "" : "locked"} ${hasDayMarkers ? "has-day-marker" : ""}`}
                onPointerDown={
                  timelineEditable
                    ? (event) => {
                        event.currentTarget.setPointerCapture(event.pointerId);
                        const minutes = pointerToMinutes(event);
                        if (isMinuteInsideDayMarker(minutes, dayMarkerSegments)) {
                          return;
                        }
                        setDrag({ employeeId: employee.id, startMinutes: minutes, currentMinutes: minutes });
                      }
                    : undefined
                }
                onPointerMove={
                  timelineEditable
                    ? (event) => {
                        if (drag?.employeeId !== employee.id) return;
                        setDrag({ ...drag, currentMinutes: pointerToMinutes(event) });
                      }
                    : undefined
                }
                onPointerUp={
                  timelineEditable
                    ? () => {
                        if (!drag || drag.employeeId !== employee.id) return;
                        const start = Math.min(drag.startMinutes, drag.currentMinutes);
                        const end = Math.max(drag.startMinutes, drag.currentMinutes);
                        setDrag(null);
                        if (end - start >= GRID_SNAP_MINUTES && !rangeIntersectsDayMarker(start, end, dayMarkerSegments)) {
                          const startParts = dateTimeFromWindowOffset(gridStart, start, timezone);
                          onCreateShift(employee.id, startParts.date, startParts.time, minutesToTime(end, windowStartTime));
                        }
                      }
                    : undefined
                }
                onDragOver={(event) => {
                  if (movingShift && timelineEditable) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={timelineEditable ? (event) => dropMovingShift(event, employee.id) : undefined}
              >
                <div className="hour-lines" aria-hidden="true">
                  {hours.slice(0, -1).map((hour) => (
                    <span key={hour} />
                  ))}
                </div>
                {dayMarkerSegments.map((segment) => (
                  <div
                    className={`daily-day-marker ${segment.marker.type.toLowerCase()} ${dayMarkerSizeClass(segment.width)}`}
                    key={segment.marker.id}
                    style={{
                      left: `${segment.left}%`,
                      width: `${segment.width}%`
                    }}
                    title={markerTitle(segment.marker.type)}
                  >
                    <strong>{segment.marker.type}</strong>
                  </div>
                ))}
                {activeDrag && selectionWidth > 0 && (
                  <div
                    className="drag-selection"
                    style={{
                      left: `${(selectionLeft / GRID_TOTAL_MINUTES) * 100}%`,
                      width: `${(selectionWidth / GRID_TOTAL_MINUTES) * 100}%`
                    }}
                  />
                )}
                {visibleShifts.map((shift) => {
                  const segment = getShiftSegment(gridStart, shift);
                  if (!segment) return null;
                  return (
                    <ShiftBlock
                      key={shift.id}
                      shift={shift}
                      leftPercent={segment.left}
                      widthPercent={segment.width}
                      lane={laneMap.get(shift.id) ?? 0}
                      onClick={() => onEditShift(employee.id, shift)}
                      onDragStart={(event) => startMovingShift(event, shift)}
                      onDragEnd={() => setMovingShift(null)}
                      canDrag={canEdit}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getShiftSegment(gridStart: Date, shift: Shift) {
  const gridEnd = new Date(gridStart.getTime() + VIEW_WINDOW_MINUTES * 60000);
  const start = new Date(shift.startAt);
  const end = new Date(shift.endAt);
  const clippedStart = Math.max(start.getTime(), gridStart.getTime());
  const clippedEnd = Math.min(end.getTime(), gridEnd.getTime());

  if (clippedEnd <= clippedStart) {
    return null;
  }

  const leftMinutes = (clippedStart - gridStart.getTime()) / 60000;
  const widthMinutes = (clippedEnd - clippedStart) / 60000;
  return segmentPosition(leftMinutes, widthMinutes);
}

function getDayMarkerSegment(gridStart: Date, marker: DayMarker) {
  const gridEnd = new Date(gridStart.getTime() + VIEW_WINDOW_MINUTES * 60000);
  const markerStart = marker.startAt ? new Date(marker.startAt) : localDateAtTime(marker.date, "00:00");
  const markerEnd = marker.endAt ? new Date(marker.endAt) : new Date(markerStart.getTime() + VIEW_WINDOW_MINUTES * 60000);
  const clippedStart = Math.max(markerStart.getTime(), gridStart.getTime());
  const clippedEnd = Math.min(markerEnd.getTime(), gridEnd.getTime());

  if (clippedEnd <= clippedStart) {
    return null;
  }

  const leftMinutes = (clippedStart - gridStart.getTime()) / 60000;
  const widthMinutes = (clippedEnd - clippedStart) / 60000;
  const position = segmentPosition(leftMinutes, widthMinutes);
  return {
    startMinutes: leftMinutes,
    endMinutes: leftMinutes + widthMinutes,
    left: position.left,
    width: position.width
  };
}

function segmentPosition(leftMinutes: number, widthMinutes: number) {
  const left = (leftMinutes / GRID_TOTAL_MINUTES) * 100;
  const width = (widthMinutes / GRID_TOTAL_MINUTES) * 100;

  return {
    left,
    width: Math.max(0, Math.min(100 - left, Math.max(2, width)))
  };
}

function dayMarkerSizeClass(widthPercent: number) {
  if (widthPercent < 3.5) {
    return "tiny";
  }

  if (widthPercent < 6) {
    return "compact";
  }

  return "";
}

function markerTitle(type: DayMarker["type"]) {
  if (type === "RDO") {
    return "Roster day off";
  }
  if (type === "SICK") {
    return "Sick leave";
  }
  return "Leave";
}

function isMinuteInsideDayMarker(
  minutes: number,
  markerSegments: Array<{ startMinutes: number; endMinutes: number }>
) {
  return markerSegments.some((segment) => minutes >= segment.startMinutes && minutes < segment.endMinutes);
}

function rangeIntersectsDayMarker(
  startMinutes: number,
  endMinutes: number,
  markerSegments: Array<{ startMinutes: number; endMinutes: number }>
) {
  return markerSegments.some((segment) => startMinutes < segment.endMinutes && endMinutes > segment.startMinutes);
}

function localDateAtTime(date: string, time: string) {
  const [year, month, day] = date.split("-").map(Number);
  const totalMinutes = parseTimeToMinutes(time);
  return new Date(year, month - 1, day, Math.floor(totalMinutes / 60), totalMinutes % 60, 0, 0);
}

function gridStartInstant(date: string, windowStartTime: string, windowStartAt?: string) {
  return windowStartAt ? new Date(windowStartAt) : localDateAtTime(date, windowStartTime);
}

function dateTimeFromWindowOffset(gridStart: Date, offsetMinutes: number, timezone?: string) {
  const instant = instantFromWindowOffset(gridStart, offsetMinutes);
  return dateTimeParts(instant, timezone);
}

function instantFromWindowOffset(gridStart: Date, offsetMinutes: number) {
  return new Date(gridStart.getTime() + offsetMinutes * 60000);
}

function dateTimeParts(instant: Date, timezone?: string) {
  if (!timezone) {
    return {
      date: `${instant.getFullYear()}-${String(instant.getMonth() + 1).padStart(2, "0")}-${String(instant.getDate()).padStart(2, "0")}`,
      time: `${String(instant.getHours()).padStart(2, "0")}:${String(instant.getMinutes()).padStart(2, "0")}`
    };
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  })
    .formatToParts(instant)
    .reduce<Record<string, string>>((result, part) => {
      result[part.type] = part.value;
      return result;
    }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour === "24" ? "00" : parts.hour}:${parts.minute}`
  };
}

function assignLanes(shifts: Shift[]) {
  const sorted = [...shifts].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const lanes: Shift[][] = [];
  const result = new Map<string, number>();

  sorted.forEach((shift) => {
    const laneIndex = lanes.findIndex((lane) => lane.every((existing) => new Date(existing.endAt) <= new Date(shift.startAt)));
    const index = laneIndex >= 0 ? laneIndex : lanes.length;
    if (!lanes[index]) {
      lanes[index] = [];
    }
    lanes[index].push(shift);
    result.set(shift.id, index);
  });

  return result;
}

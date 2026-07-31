import { AlertTriangle } from "lucide-react";
import type { DragEvent } from "react";
import { Shift } from "../../../types/api";
import { getContrastText } from "../../../utilities/colour";
import { timeLabel12 } from "../utilities/dates";

type Props = {
  shift: Shift;
  leftPercent: number;
  widthPercent: number;
  lane: number;
  onClick: () => void;
  onDragStart: (event: DragEvent<HTMLButtonElement>) => void;
  onDragEnd: () => void;
  canDrag?: boolean;
};

export function ShiftBlock({ shift, leftPercent, widthPercent, lane, onClick, onDragStart, onDragEnd, canDrag = true }: Props) {
  const background = shift.department.colourHex;
  const color = getContrastText(background);

  return (
    <button
      className={`shift-block ${canDrag ? "" : "locked"}`}
      draggable={canDrag}
      type="button"
      style={{
        left: `${leftPercent}%`,
        width: `${widthPercent}%`,
        top: `${8 + lane * 32}px`,
        background,
        color
      }}
      title={`${shift.department.name} ${timeLabel12(shift.startAt)}-${timeLabel12(shift.endAt)}`}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
      onDragStart={(event) => {
        event.stopPropagation();
        if (!canDrag) {
          event.preventDefault();
          return;
        }
        onDragStart(event);
      }}
      onDragEnd={(event) => {
        event.stopPropagation();
        onDragEnd();
      }}
    >
      <span>{shift.department.shortCode}</span>
      <time>
        {timeLabel12(shift.startAt)}-{timeLabel12(shift.endAt)}
      </time>
      {shift.hasOverlap && <AlertTriangle size={13} aria-label="Overlap" />}
    </button>
  );
}

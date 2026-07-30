import { AlertTriangle } from "lucide-react";
import type { CSSProperties } from "react";
import { Shift } from "../../../types/api";
import { getContrastText } from "../../../utilities/colour";
import { isNextDay, timeLabel } from "../utilities/dates";

type Props = {
  shift: Shift;
  date?: string;
  onClick: () => void;
};

export function WeeklyShiftLine({ shift, date, onClick }: Props) {
  const background = shift.department.colourHex;
  const color = getContrastText(background);
  const segment = date ? shift.rosterSegments?.find((segment) => segment.date === date) : undefined;
  const timeText = segment ? `${segment.startTime}-${segment.endTime}` : `${timeLabel(shift.startAt)}-${timeLabel(shift.endAt)}${isNextDay(shift.startAt, shift.endAt) ? " +1" : ""}`;

  return (
    <button
      type="button"
      className="weekly-shift-line"
      style={{ "--department-colour": background } as CSSProperties}
      title={shift.department.name}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      <span className="weekly-code" style={{ background, color }}>
        {shift.department.shortCode}
      </span>
      <time>{timeText}</time>
      {shift.hasOverlap && <AlertTriangle size={13} aria-label="Overlap" />}
    </button>
  );
}

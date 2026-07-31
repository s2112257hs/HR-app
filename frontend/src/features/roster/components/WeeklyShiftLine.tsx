import { AlertTriangle } from "lucide-react";
import type { CSSProperties } from "react";
import { Shift } from "../../../types/api";
import { getContrastText } from "../../../utilities/colour";
import { weeklyShiftTimeText } from "../utilities/dates";

type Props = {
  shift: Shift;
  onClick: () => void;
};

export function WeeklyShiftLine({ shift, onClick }: Props) {
  const background = shift.department.colourHex;
  const color = getContrastText(background);
  const timeText = weeklyShiftTimeText(shift);

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

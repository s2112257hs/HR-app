import { AlertTriangle } from "lucide-react";
import { OverlapCheckResponse } from "../../../types/api";
import { timeLabel } from "../utilities/dates";

type Props = {
  overlaps: OverlapCheckResponse["overlaps"];
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  pending?: boolean;
};

export function OverlapWarningDialog({ overlaps, onCancel, onConfirm, confirmLabel = "Create anyway", pending }: Props) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="dialog-panel warning-dialog" role="dialog" aria-modal="true" aria-labelledby="overlap-title">
        <div className="dialog-heading">
          <AlertTriangle size={22} aria-hidden="true" />
          <h2 id="overlap-title">Overlap warning</h2>
        </div>
        <div className="overlap-list">
          {overlaps.map((overlap) => (
            <div className="overlap-item" key={overlap.shiftId}>
              <strong>{overlap.departmentShortCode}</strong>
              <span>{overlap.departmentName}</span>
              <time>
                {timeLabel(overlap.startAt)}-{timeLabel(overlap.endAt)}
              </time>
            </div>
          ))}
        </div>
        <div className="dialog-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" type="button" onClick={onConfirm} disabled={pending}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

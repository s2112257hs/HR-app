import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { fetchOtSummary } from "../../api/roster";
import { todayKey } from "./utilities/dates";

export function OtCalculatorPage() {
  const today = todayKey();
  const [fromDate, setFromDate] = useState(today);
  const [toDate, setToDate] = useState(today);
  const dateError = fromDate && toDate && toDate < fromDate ? "To date must be the same as or later than from date." : null;
  const summaryQuery = useQuery({
    queryKey: ["ot-summary", fromDate, toDate],
    queryFn: () => fetchOtSummary(fromDate, toDate),
    enabled: Boolean(fromDate && toDate && !dateError)
  });

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>OT tracker</h1>
          <p>OT by employee from selected dates.</p>
        </div>
        <div className="toolbar">
          <label>
            From
            <input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} />
          </label>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              setFromDate(today);
              setToDate(today);
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            Today
          </button>
        </div>
      </header>
      {dateError && <div className="form-error">{dateError}</div>}
      {!dateError && summaryQuery.isLoading && <div className="skeleton-panel" />}
      {!dateError && summaryQuery.isError && (
        <div className="form-error">
          OT summary could not be loaded.
          <button className="link-button" type="button" onClick={() => void summaryQuery.refetch()}>
            Retry
          </button>
        </div>
      )}
      {!dateError && summaryQuery.data && (
        <div className="table-panel">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Primary department</th>
                <th>Hours worked</th>
                <th>OT</th>
              </tr>
            </thead>
            <tbody>
              {summaryQuery.data.employees.map((employee) => (
                <tr key={employee.employeeId}>
                  <td className="tracker-employee-cell" style={{ "--primary-department-colour": employee.primaryDepartment?.colourHex ?? "transparent" } as CSSProperties}>
                    <strong>{employee.displayName}</strong>
                  </td>
                  <td>{employee.primaryDepartment?.shortCode ?? ""}</td>
                  <td>{formatHours(employee.hoursWorkedMinutes)}</td>
                  <td>{formatHours(employee.overtimeMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function formatHours(minutes: number) {
  return `${(minutes / 60).toFixed(2)} h`;
}

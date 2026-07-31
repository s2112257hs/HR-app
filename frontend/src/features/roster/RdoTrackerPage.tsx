import { useQuery } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";
import { useState } from "react";
import { fetchRdoTracker } from "../../api/dayMarkers";
import { todayKey } from "./utilities/dates";

export function RdoTrackerPage() {
  const [asOfDate, setAsOfDate] = useState(todayKey());
  const trackerQuery = useQuery({
    queryKey: ["rdo-tracker", asOfDate],
    queryFn: () => fetchRdoTracker(asOfDate)
  });

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>RDO tracker</h1>
          <p>{trackerQuery.data?.employees.length ?? 0} employees</p>
        </div>
        <div className="toolbar">
          <button className="secondary-button" type="button" onClick={() => setAsOfDate(todayKey())}>
            <RotateCcw size={16} aria-hidden="true" />
            Today
          </button>
          <input type="date" value={asOfDate} onChange={(event) => setAsOfDate(event.target.value)} />
        </div>
      </header>
      {trackerQuery.isLoading && <div className="skeleton-panel" />}
      {trackerQuery.isError && (
        <div className="form-error">
          RDO tracker could not be loaded.
          <button className="link-button" type="button" onClick={() => void trackerQuery.refetch()}>
            Retry
          </button>
        </div>
      )}
      {trackerQuery.data && (
        <div className="table-panel">
          <table>
            <thead>
              <tr>
                <th>Employee</th>
                <th>Primary department</th>
                <th>Tracked from</th>
                <th>RDO required</th>
                <th>RDO taken</th>
                <th>Balance b/d</th>
                <th>RDO owed</th>
              </tr>
            </thead>
            <tbody>
              {trackerQuery.data.employees.map((employee) => (
                <tr key={employee.employeeId}>
                  <td>
                    <strong>{employee.displayName}</strong>
                    {employee.employeeNumber && <span className="table-subtext">{employee.employeeNumber}</span>}
                  </td>
                  <td>{employee.primaryDepartment?.shortCode ?? ""}</td>
                  <td>{employee.trackingStartDate}</td>
                  <td>{employee.requiredRdo}</td>
                  <td>{employee.rdoTaken}</td>
                  <td>{employee.rdoBalanceBroughtForward}</td>
                  <td>
                    <span className={`rdo-owed-pill ${employee.rdoOwed > 0 ? "owing" : ""} ${employee.rdoOwed < 0 ? "ahead" : ""}`}>{employee.rdoOwed}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

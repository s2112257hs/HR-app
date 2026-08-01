import { useQuery } from "@tanstack/react-query";
import type { CSSProperties } from "react";
import { fetchRdoTracker } from "../../api/dayMarkers";

export function RdoTrackerPage() {
  const trackerQuery = useQuery({
    queryKey: ["rdo-tracker", "today"],
    queryFn: () => fetchRdoTracker()
  });

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>RDO tracker</h1>
          <p>{trackerQuery.data?.employees.length ?? 0} employees</p>
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
        <>
          <div className="panel compact-info-panel">
            <strong>Tracked from {trackerQuery.data.trackingStartDate}</strong>
            <span>As of {trackerQuery.data.asOfDate}</span>
          </div>
          <div className="table-panel">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Primary department</th>
                  <th>RDO required</th>
                  <th>RDO taken</th>
                  <th>Balance b/d</th>
                  <th>RDO owed</th>
                </tr>
              </thead>
              <tbody>
                {trackerQuery.data.employees.map((employee) => (
                  <tr key={employee.employeeId}>
                    <td className="tracker-employee-cell" style={{ "--primary-department-colour": employee.primaryDepartment?.colourHex ?? "transparent" } as CSSProperties}>
                      <strong>{employee.displayName}</strong>
                    </td>
                    <td>{employee.primaryDepartment?.shortCode ?? ""}</td>
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
        </>
      )}
    </section>
  );
}

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import type { CSSProperties } from "react";
import { fetchRdoTracker } from "../../api/dayMarkers";
import type { RdoTrackerResponse } from "../../types/api";
import { downloadExcelSheet, type ExcelColumn } from "../../utilities/excelExport";

type RdoTrackerEmployee = RdoTrackerResponse["employees"][number];

const RDO_TRACKER_COLUMNS: ExcelColumn<RdoTrackerEmployee>[] = [
  { header: "Employee number", value: (employee) => employee.employeeNumber ?? "", width: 18 },
  { header: "Employee", value: (employee) => employee.displayName, width: 28 },
  { header: "Primary department", value: (employee) => employee.primaryDepartment?.shortCode ?? "", width: 20 },
  { header: "Tracking start date", value: (employee) => employee.trackingStartDate, width: 20 },
  { header: "RDO required", value: (employee) => employee.requiredRdo, width: 16 },
  { header: "RDO taken", value: (employee) => employee.rdoTaken, width: 14 },
  { header: "Balance b/d", value: (employee) => employee.rdoBalanceBroughtForward, width: 14 },
  { header: "RDO owed", value: (employee) => employee.rdoOwed, width: 12 }
];

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
        <div className="toolbar">
          <button
            className="secondary-button"
            type="button"
            onClick={() => trackerQuery.data && downloadRdoTrackerExcel(trackerQuery.data)}
            disabled={!trackerQuery.data?.employees.length}
          >
            <Download size={16} aria-hidden="true" />
            Excel
          </button>
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

function downloadRdoTrackerExcel(tracker: RdoTrackerResponse) {
  downloadExcelSheet({
    fileName: `rdo-tracker-${tracker.asOfDate}.xlsx`,
    sheetName: "RDO Tracker",
    columns: RDO_TRACKER_COLUMNS,
    rows: tracker.employees
  });
}

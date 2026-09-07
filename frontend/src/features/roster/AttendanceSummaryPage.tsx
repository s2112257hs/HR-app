import { useQuery } from "@tanstack/react-query";
import { Download, RotateCcw } from "lucide-react";
import { useState, type CSSProperties } from "react";
import { fetchAttendanceSummary } from "../../api/roster";
import type { AttendanceSummaryResponse } from "../../types/api";
import { downloadExcelSheet, type ExcelColumn } from "../../utilities/excelExport";
import { todayKey } from "./utilities/dates";

type AttendanceSummaryEmployee = AttendanceSummaryResponse["employees"][number];

const ATTENDANCE_SUMMARY_COLUMNS: ExcelColumn<AttendanceSummaryEmployee>[] = [
  { header: "Employee number", value: (employee) => employee.employeeNumber ?? "", width: 18 },
  { header: "Employee", value: (employee) => employee.displayName, width: 28 },
  { header: "Primary department", value: (employee) => employee.primaryDepartment?.shortCode ?? "", width: 20 },
  { header: "Worked", value: (employee) => employee.workedDays, width: 12 },
  { header: "RDO", value: (employee) => employee.rdoDays, width: 12 },
  { header: "Sick", value: (employee) => employee.sickDays, width: 12 },
  { header: "Leave", value: (employee) => employee.leaveDays, width: 12 },
  { header: "Blank", value: (employee) => employee.blankDays, width: 12 },
  { header: "Total days", value: (employee) => employee.totalDays, width: 14 }
];

export function AttendanceSummaryPage() {
  const today = todayKey();
  const currentMonth = today.slice(0, 7);
  const [fromDate, setFromDate] = useState(monthStart(currentMonth));
  const [toDate, setToDate] = useState(monthEnd(currentMonth));
  const [month, setMonth] = useState(currentMonth);
  const dateError = fromDate && toDate && toDate < fromDate ? "To date must be the same as or later than from date." : null;
  const summaryQuery = useQuery({
    queryKey: ["attendance-summary", fromDate, toDate],
    queryFn: () => fetchAttendanceSummary(fromDate, toDate),
    enabled: Boolean(fromDate && toDate && !dateError)
  });

  function applyMonth(value: string) {
    setMonth(value);
    if (!value) {
      return;
    }
    setFromDate(monthStart(value));
    setToDate(monthEnd(value));
  }

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>Attendance summary</h1>
          <p>{summaryQuery.data ? `${summaryQuery.data.totalDays} days from ${summaryQuery.data.fromDate} to ${summaryQuery.data.toDate}` : "Worked, leave and blank days by employee."}</p>
        </div>
        <div className="toolbar">
          <label>
            Month
            <input type="month" value={month} onChange={(event) => applyMonth(event.target.value)} />
          </label>
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
            onClick={() => summaryQuery.data && downloadAttendanceSummaryExcel(summaryQuery.data)}
            disabled={Boolean(dateError) || !summaryQuery.data?.employees.length}
          >
            <Download size={16} aria-hidden="true" />
            Excel
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => {
              applyMonth(currentMonth);
            }}
          >
            <RotateCcw size={16} aria-hidden="true" />
            This month
          </button>
        </div>
      </header>
      {dateError && <div className="form-error">{dateError}</div>}
      {!dateError && summaryQuery.isLoading && <div className="skeleton-panel" />}
      {!dateError && summaryQuery.isError && (
        <div className="form-error">
          Attendance summary could not be loaded.
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
                <th>Worked</th>
                <th>RDO</th>
                <th>Sick</th>
                <th>Leave</th>
                <th>Blank</th>
                <th>Total days</th>
              </tr>
            </thead>
            <tbody>
              {summaryQuery.data.employees.map((employee) => (
                <tr key={employee.employeeId}>
                  <td className="tracker-employee-cell" style={{ "--primary-department-colour": employee.primaryDepartment?.colourHex ?? "transparent" } as CSSProperties}>
                    <strong>{employee.displayName}</strong>
                  </td>
                  <td>{employee.primaryDepartment?.shortCode ?? ""}</td>
                  <td>
                    <span className="summary-count-pill worked-days-pill">{employee.workedDays}</span>
                  </td>
                  <td>{employee.rdoDays}</td>
                  <td>{employee.sickDays}</td>
                  <td>{employee.leaveDays}</td>
                  <td>{employee.blankDays}</td>
                  <td>
                    <span className="summary-count-pill total-days-pill">{employee.totalDays}</span>
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

function downloadAttendanceSummaryExcel(summary: AttendanceSummaryResponse) {
  downloadExcelSheet({
    fileName: `attendance-summary-${summary.fromDate}-to-${summary.toDate}.xlsx`,
    sheetName: "Attendance Summary",
    columns: ATTENDANCE_SUMMARY_COLUMNS,
    rows: summary.employees
  });
}

function monthStart(month: string) {
  return `${month}-01`;
}

function monthEnd(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();

  return `${month}-${String(lastDay).padStart(2, "0")}`;
}

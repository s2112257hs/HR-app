import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { DepartmentsPage } from "../features/departments/DepartmentsPage";
import { EmployeesPage } from "../features/employees/EmployeesPage";
import { LoginPage } from "../features/authentication/LoginPage";
import { AttendanceSummaryPage } from "../features/roster/AttendanceSummaryPage";
import { DailyRosterPage } from "../features/roster/DailyRosterPage";
import { OtCalculatorPage } from "../features/roster/OtCalculatorPage";
import { RdoTrackerPage } from "../features/roster/RdoTrackerPage";
import { WeeklyRosterPage } from "../features/roster/WeeklyRosterPage";
import { UsersPage } from "../features/users/UsersPage";
import { SuperAdminPage } from "../features/super-admin/SuperAdminPage";
import { RequireAuth } from "../routes/RequireAuth";
import { SettingsPage } from "../pages/SettingsPage";
import { useAuth } from "../features/authentication/AuthProvider";

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route index element={<Navigate to="/roster/weekly" replace />} />
          <Route path="/roster/daily" element={<DailyRosterPage />} />
          <Route path="/roster/weekly" element={<WeeklyRosterPage />} />
          <Route path="/roster/ot-calculator" element={<Navigate to="/roster/ot-tracker" replace />} />
          <Route path="/roster/ot-tracker" element={<OtCalculatorPage />} />
          <Route path="/roster/rdo-tracker" element={<RdoTrackerPage />} />
          <Route path="/roster/attendance-summary" element={<AttendanceSummaryPage />} />
          <Route element={<RequireManagerOrAdmin />}>
            <Route path="/back-office/employees" element={<EmployeesPage />} />
            <Route path="/back-office/departments" element={<DepartmentsPage />} />
          </Route>
          <Route element={<RequireAdmin />}>
            <Route path="/back-office/users" element={<UsersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
          <Route element={<RequireSuperAdmin />}>
            <Route path="/super-admin" element={<SuperAdminPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/roster/weekly" replace />} />
    </Routes>
  );
}

function RequireSuperAdmin() {
  const { user } = useAuth();

  if (!user?.isSuperAdmin) {
    return <Navigate to="/roster/weekly" replace />;
  }

  return <Outlet />;
}

function RequireAdmin() {
  const { user } = useAuth();

  if (user?.role !== "ADMIN" && !user?.isSuperAdmin) {
    return <Navigate to="/roster/weekly" replace />;
  }

  return <Outlet />;
}

function RequireManagerOrAdmin() {
  const { user } = useAuth();

  if (user?.role !== "ADMIN" && user?.role !== "ROSTER_MANAGER" && !user?.isSuperAdmin) {
    return <Navigate to="/roster/weekly" replace />;
  }

  return <Outlet />;
}

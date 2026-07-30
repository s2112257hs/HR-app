import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AppLayout } from "../components/AppLayout";
import { DepartmentsPage } from "../features/departments/DepartmentsPage";
import { EmployeesPage } from "../features/employees/EmployeesPage";
import { LoginPage } from "../features/authentication/LoginPage";
import { DailyRosterPage } from "../features/roster/DailyRosterPage";
import { RdoTrackerPage } from "../features/roster/RdoTrackerPage";
import { WeeklyRosterPage } from "../features/roster/WeeklyRosterPage";
import { UsersPage } from "../features/users/UsersPage";
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
          <Route path="/roster/rdo-tracker" element={<RdoTrackerPage />} />
          <Route element={<RequireAdmin />}>
            <Route path="/back-office/employees" element={<EmployeesPage />} />
            <Route path="/back-office/departments" element={<DepartmentsPage />} />
            <Route path="/back-office/users" element={<UsersPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/roster/weekly" replace />} />
    </Routes>
  );
}

function RequireAdmin() {
  const { user } = useAuth();

  if (user?.role !== "ADMIN") {
    return <Navigate to="/roster/weekly" replace />;
  }

  return <Outlet />;
}

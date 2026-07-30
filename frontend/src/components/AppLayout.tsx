import { Building2, CalendarCheck, CalendarDays, CalendarRange, LogOut, Moon, PanelLeftClose, PanelLeftOpen, Settings, Sun, UserCog, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/authentication/AuthProvider";

const navItems = [
  { to: "/roster/daily", label: "Daily", icon: CalendarDays },
  { to: "/roster/weekly", label: "Weekly", icon: CalendarRange },
  { to: "/roster/rdo-tracker", label: "RDO Tracker", icon: CalendarCheck },
  { to: "/back-office/employees", label: "Employees", icon: Users, managerAllowed: true },
  { to: "/back-office/departments", label: "Departments", icon: Building2, managerAllowed: true },
  { to: "/back-office/users", label: "Users", icon: UserCog, adminOnly: true },
  { to: "/settings", label: "Settings", icon: Settings, adminOnly: true }
];

const THEME_KEY = "hr-roster-theme";

export function AppLayout() {
  const { user, logout } = useAuth();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored) {
      return stored === "dark";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });
  const visibleNavItems = navItems.filter((item) => {
    if (item.adminOnly) {
      return user?.role === "ADMIN";
    }

    if (item.managerAllowed) {
      return user?.role === "ADMIN" || user?.role === "ROSTER_MANAGER";
    }

    return true;
  });

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? "dark" : "light";
    localStorage.setItem(THEME_KEY, darkMode ? "dark" : "light");
  }, [darkMode]);

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <aside className={`sidebar ${sidebarCollapsed ? "collapsed" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark" title="HR Roster">HR</div>
          <div>
            <strong>Roster</strong>
            <span>{user?.role.replace("_", " ")}</span>
          </div>
          <button
            className="icon-button sidebar-toggle"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} aria-hidden="true" /> : <PanelLeftClose size={18} aria-hidden="true" />}
          </button>
        </div>
        <nav className="nav-list" aria-label="Primary">
          {visibleNavItems.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`} title={sidebarCollapsed ? item.label : undefined}>
              <item.icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-footer">
          <button className="icon-text-button" type="button" onClick={() => setDarkMode((value) => !value)} title={sidebarCollapsed ? "Toggle dark mode" : undefined}>
            {darkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
            <span>{darkMode ? "Light mode" : "Dark mode"}</span>
          </button>
          <button className="icon-text-button sidebar-action" type="button" onClick={logout} title={sidebarCollapsed ? "Log out" : undefined}>
            <LogOut size={18} aria-hidden="true" />
            <span>Log out</span>
          </button>
        </div>
      </aside>
      <main className="main-pane">
        <Outlet />
      </main>
    </div>
  );
}

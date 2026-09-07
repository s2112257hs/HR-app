import { AlertTriangle, CheckCircle2, Download, Edit2, Key, Plus, Search, ShieldCheck, Trash2, UserCog, UserPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { apiRequest } from "../../api/client";
import { SuperAdminOrganisation, SuperAdminUser, User, UserRole } from "../../types/api";
import { downloadExcelSheet, type ExcelColumn } from "../../utilities/excelExport";
import { friendlyApiMessage } from "../../utilities/formErrors";
import { useAuth } from "../authentication/AuthProvider";

const SUPER_ADMIN_ORGANISATION_COLUMNS: ExcelColumn<SuperAdminOrganisation>[] = [
  { header: "Code", value: (organisation) => organisation.code, width: 12 },
  { header: "Property name", value: (organisation) => organisation.name, width: 30 },
  { header: "Timezone", value: (organisation) => organisation.timezone, width: 24 },
  { header: "Week start day", value: (organisation) => organisation.weekStartDay, width: 16 },
  { header: "Users", value: (organisation) => organisation.stats.usersCount, width: 12 },
  { header: "Employees", value: (organisation) => organisation.stats.employeesCount, width: 12 },
  { header: "Departments", value: (organisation) => organisation.stats.departmentsCount, width: 14 },
  { header: "Shifts", value: (organisation) => organisation.stats.shiftsCount, width: 12 },
  { header: "Created at", value: (organisation) => organisation.createdAt, width: 24 }
];

const SUPER_ADMIN_USER_COLUMNS: ExcelColumn<SuperAdminUser>[] = [
  { header: "Name", value: (user) => user.name, width: 24 },
  { header: "Username", value: (user) => user.username ?? "", width: 20 },
  { header: "Email", value: (user) => user.email, width: 30 },
  { header: "Role", value: (user) => user.role.replace("_", " "), width: 18 },
  { header: "Status", value: (user) => (user.isActive ? "Active" : "Inactive"), width: 12 },
  { header: "Primary property", value: (user) => formatPropertyLabel(user.primaryOrganisation), width: 34 },
  { header: "Property access", value: (user) => user.memberships.map(formatMembershipLabel).join("; "), width: 60 }
];

export function SuperAdminPage() {
  const { user, updateCurrentUser, refreshOrganisations } = useAuth();
  const [organisations, setOrganisations] = useState<SuperAdminOrganisation[]>([]);
  const [users, setUsers] = useState<SuperAdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New Org Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    timezone: "Indian/Maldives"
  });
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Existing Property Admin Modal state
  const [showAdminModal, setShowAdminModal] = useState(false);
  const [adminForm, setAdminForm] = useState({
    organisationId: "",
    name: "",
    username: "",
    email: "",
    password: ""
  });
  const [adminSubmitting, setAdminSubmitting] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);

  // Edit Code Modal state
  const [editingOrg, setEditingOrg] = useState<SuperAdminOrganisation | null>(null);
  const [newCode, setNewCode] = useState("");
  const [codeSubmitting, setCodeSubmitting] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [deletingOrganisation, setDeletingOrganisation] = useState<SuperAdminOrganisation | null>(null);
  const [deletingUser, setDeletingUser] = useState<SuperAdminUser | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Grant Membership state
  const [showMembershipModal, setShowMembershipModal] = useState(false);
  const [membershipForm, setMembershipForm] = useState({
    userId: "",
    organisationId: "",
    role: "ROSTER_MANAGER" as UserRole
  });
  const [membershipSubmitting, setMembershipSubmitting] = useState(false);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [membershipSuccess, setMembershipSuccess] = useState<string | null>(null);
  const [membershipUserQuery, setMembershipUserQuery] = useState("");
  const [membershipPropertyQuery, setMembershipPropertyQuery] = useState("");

  // Change Super Admin Credentials state
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [superAdminUsername, setSuperAdminUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordSubmitting, setPasswordSubmitting] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const handleChangeCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setPasswordSubmitting(true);
      setPasswordError(null);
      setPasswordSuccess(null);
      const response = await apiRequest<{ user: Partial<User>; message?: string }>("/super-admin/credentials", {
        method: "PATCH",
        body: JSON.stringify({
          username: superAdminUsername.trim(),
          newPassword: newPassword || undefined
        })
      });
      updateCurrentUser(response.user);
      setSuperAdminUsername(response.user.username ?? superAdminUsername.trim());
      setPasswordSuccess(response.message ?? "Super Admin credentials updated successfully.");
      setNewPassword("");
    } catch (err) {
      setPasswordError(friendlyApiMessage(err, "Failed to update credentials. Password must be at least 8 characters."));
    } finally {
      setPasswordSubmitting(false);
    }
  };

  useEffect(() => {
    if (user?.username && !showPasswordModal) {
      setSuperAdminUsername(user.username);
    }
  }, [showPasswordModal, user?.username]);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [orgData, userData] = await Promise.all([
        apiRequest<SuperAdminOrganisation[]>("/super-admin/organisations"),
        apiRequest<SuperAdminUser[]>("/super-admin/users")
      ]);
      setOrganisations(orgData);
      setUsers(userData);
    } catch (err) {
      setError(friendlyApiMessage(err, "Failed to load organisations. Ensure you are signed in as Super Admin."));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAdminSubmitting(true);
      setAdminError(null);
      await apiRequest("/super-admin/admins", {
        method: "POST",
        body: JSON.stringify({
          organisationId: adminForm.organisationId,
          name: adminForm.name.trim(),
          username: adminForm.username.trim() || undefined,
          email: adminForm.email.trim(),
          password: adminForm.password
        })
      });
      setShowAdminModal(false);
      setAdminForm({
        organisationId: "",
        name: "",
        username: "",
        email: "",
        password: ""
      });
      await loadData();
    } catch (err) {
      setAdminError(friendlyApiMessage(err, "Failed to create admin for this property."));
    } finally {
      setAdminSubmitting(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setCreateSubmitting(true);
      setCreateError(null);
      await apiRequest("/super-admin/organisations", {
        method: "POST",
        body: JSON.stringify({
          name: createForm.name.trim(),
          code: createForm.code.trim() ? createForm.code.trim() : undefined,
          timezone: createForm.timezone.trim()
        })
      });
      setShowCreateModal(false);
      setCreateForm({
        name: "",
        code: "",
        timezone: "Indian/Maldives"
      });
      await loadData();
      await refreshOrganisations();
    } catch (err) {
      setCreateError(friendlyApiMessage(err, "Failed to create organisation."));
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleUpdateCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrg) return;
    try {
      setCodeSubmitting(true);
      setCodeError(null);
      await apiRequest(`/super-admin/organisations/${editingOrg.id}/code`, {
        method: "PATCH",
        body: JSON.stringify({ code: newCode.trim() })
      });
      setEditingOrg(null);
      setNewCode("");
      await loadData();
      await refreshOrganisations();
    } catch (err) {
      setCodeError(friendlyApiMessage(err, "Failed to update code. Must be a unique 4-digit number (0001-9999)."));
    } finally {
      setCodeSubmitting(false);
    }
  };

  const handleDeleteOrganisation = async () => {
    if (!deletingOrganisation) return;

    try {
      setDeleteSubmitting(true);
      setDeleteError(null);
      await apiRequest(`/super-admin/organisations/${deletingOrganisation.id}`, { method: "DELETE" });
      setDeletingOrganisation(null);
      await loadData();
      await refreshOrganisations();
    } catch (err) {
      setDeleteError(friendlyApiMessage(err, "Failed to permanently delete property."));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;

    try {
      setDeleteSubmitting(true);
      setDeleteError(null);
      await apiRequest(`/super-admin/users/${deletingUser.id}`, { method: "DELETE" });
      setDeletingUser(null);
      await loadData();
    } catch (err) {
      setDeleteError(friendlyApiMessage(err, "Failed to permanently delete user."));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const handleGrantMembership = async (e: React.FormEvent) => {
    e.preventDefault();
    const selectedUser = users.find((item) => item.id === membershipForm.userId);
    const selectedOrganisation = organisations.find((item) => item.id === membershipForm.organisationId);

    if (!selectedUser || !selectedOrganisation) {
      setMembershipError("Select one user and one target property before assigning access.");
      setMembershipSuccess(null);
      return;
    }

    const identityConflict = findTargetIdentityConflict(selectedUser, selectedOrganisation.id);
    if (identityConflict) {
      setMembershipError(
        `Cannot assign this user to ${propertyLabel(selectedOrganisation)}. ${identityConflict.name} (${identityConflict.email}) from ${propertyLabel(
          identityConflict.primaryOrganisation
        )} already has access there with the same email or username.`
      );
      setMembershipSuccess(null);
      return;
    }

    try {
      setMembershipSubmitting(true);
      setMembershipError(null);
      setMembershipSuccess(null);
      await apiRequest("/super-admin/memberships", {
        method: "POST",
        body: JSON.stringify({
          userId: membershipForm.userId.trim(),
          organisationId: membershipForm.organisationId.trim(),
          role: membershipForm.role
        })
      });
      setMembershipSuccess(
        `${selectedUser.name} from [${selectedUser.primaryOrganisation.code}] ${selectedUser.primaryOrganisation.name} now has ${membershipForm.role.replace(
          "_",
          " "
        )} access to [${selectedOrganisation.code}] ${selectedOrganisation.name}.`
      );
      setMembershipForm({ userId: "", organisationId: "", role: "ROSTER_MANAGER" });
      setMembershipUserQuery("");
      setMembershipPropertyQuery("");
      await loadData();
    } catch (err) {
      setMembershipError(friendlyApiMessage(err, "Failed to grant membership. Verify User ID and Organisation ID."));
    } finally {
      setMembershipSubmitting(false);
    }
  };

  const selectedMembershipUser = users.find((item) => item.id === membershipForm.userId) ?? null;
  const selectedMembershipOrganisation = organisations.find((item) => item.id === membershipForm.organisationId) ?? null;
  const selectedUserCurrentMembership = selectedMembershipUser?.memberships.find((membership) => membership.organisation.id === membershipForm.organisationId) ?? null;
  const propertyLabel = (organisation: { code: string; name: string }) => `[${organisation.code}] ${organisation.name}`;
  const findTargetIdentityConflict = (sourceUser: SuperAdminUser | null, organisationId: string) => {
    if (!sourceUser) {
      return null;
    }

    const sourceEmail = sourceUser.email.trim().toLowerCase();
    const sourceUsername = sourceUser.username?.trim().toLowerCase();

    return (
      users.find((item) => {
        const sameEmail = item.email.trim().toLowerCase() === sourceEmail;
        const sameUsername = Boolean(sourceUsername && item.username?.trim().toLowerCase() === sourceUsername);
        const hasTargetAccess = item.memberships.some((membership) => membership.organisation.id === organisationId);

        return item.id !== sourceUser.id && item.isActive && hasTargetAccess && (sameEmail || sameUsername);
      }) ?? null
    );
  };
  const selectedMembershipIdentityConflict = selectedMembershipOrganisation ? findTargetIdentityConflict(selectedMembershipUser, selectedMembershipOrganisation.id) : null;
  const normalizedUserQuery = membershipUserQuery.trim().toLowerCase();
  const normalizedPropertyQuery = membershipPropertyQuery.trim().toLowerCase();
  const filteredMembershipUsers = users.filter((item) => {
    const searchable = [
      item.name,
      item.username ?? "",
      item.email,
      item.primaryOrganisation.code,
      item.primaryOrganisation.name,
      ...item.memberships.flatMap((membership) => [membership.organisation.code, membership.organisation.name, membership.role])
    ]
      .join(" ")
      .toLowerCase();

    return !normalizedUserQuery || searchable.includes(normalizedUserQuery);
  });
  const filteredMembershipOrganisations = organisations.filter((organisation) => {
    const searchable = [organisation.code, organisation.name, organisation.timezone].join(" ").toLowerCase();
    return !normalizedPropertyQuery || searchable.includes(normalizedPropertyQuery);
  });

  return (
    <div className="super-admin-container" style={{ maxWidth: "1200px", margin: "0 auto" }}>
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h1 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.5rem", fontWeight: 700 }}>
            <ShieldCheck size={26} style={{ color: "var(--color-primary, #2563eb)" }} />
            Super Admin Portal
          </h1>
          <p style={{ color: "var(--color-text-secondary, #6b7280)", margin: "0.25rem 0 0 0" }}>
            Platform organisation management, 4-digit code configuration, and multi-tenant access control.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="secondary-button"
            onClick={() => downloadSuperAdminOrganisationsExcel(organisations)}
            disabled={loading || organisations.length === 0}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", cursor: loading || organisations.length === 0 ? "not-allowed" : "pointer" }}
          >
            <Download size={16} />
            Properties Excel
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => downloadSuperAdminUsersExcel(users)}
            disabled={loading || users.length === 0}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", cursor: loading || users.length === 0 ? "not-allowed" : "pointer" }}
          >
            <Download size={16} />
            Users Excel
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setSuperAdminUsername(user?.username ?? "");
              setNewPassword("");
              setShowPasswordModal(true);
              setPasswordError(null);
              setPasswordSuccess(null);
            }}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            <Key size={16} />
            Credentials
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setShowMembershipModal(true);
              setMembershipForm({ userId: "", organisationId: "", role: "ROSTER_MANAGER" });
              setMembershipUserQuery("");
              setMembershipPropertyQuery("");
              setMembershipError(null);
              setMembershipSuccess(null);
            }}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            <UserPlus size={16} />
            Assign Users
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              setAdminForm((form) => ({ ...form, organisationId: organisations[0]?.id ?? "" }));
              setShowAdminModal(true);
              setAdminError(null);
            }}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            <UserCog size={16} />
            New Admin
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => setShowCreateModal(true)}
            style={{ display: "flex", alignItems: "center", gap: "0.4rem", padding: "0.5rem 1rem", cursor: "pointer" }}
          >
            <Plus size={16} />
            Create Property
          </button>
        </div>
      </div>

      {error && <div className="form-error" style={{ marginBottom: "1.5rem", padding: "1rem", borderRadius: "0.5rem", background: "#fee2e2", color: "#991b1b" }}>{error}</div>}

      {loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--color-text-secondary, #6b7280)" }}>Loading organisations...</div>
      ) : (
        <div className="table-container" style={{ background: "var(--color-bg-surface, #ffffff)", border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "0.5rem", overflow: "hidden", marginBottom: "1.5rem" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-muted, #f9fafb)", borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                <th style={{ padding: "0.75rem 1rem" }}>Code</th>
                <th style={{ padding: "0.75rem 1rem" }}>Property Name</th>
                <th style={{ padding: "0.75rem 1rem" }}>Timezone</th>
                <th style={{ padding: "0.75rem 1rem" }}>Users</th>
                <th style={{ padding: "0.75rem 1rem" }}>Employees</th>
                <th style={{ padding: "0.75rem 1rem" }}>Shifts</th>
                <th style={{ padding: "0.75rem 1rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {organisations.map((org) => (
                <tr key={org.id} style={{ borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 700, fontFamily: "monospace", fontSize: "1rem" }}>
                    <span style={{ padding: "0.2rem 0.5rem", background: "var(--color-bg-muted, #f3f4f6)", borderRadius: "0.25rem", border: "1px solid var(--color-border, #e5e7eb)" }}>
                      {org.code}
                    </span>
                  </td>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{org.name}</td>
                  <td style={{ padding: "0.75rem 1rem", color: "var(--color-text-secondary, #6b7280)" }}>{org.timezone}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{org.stats.usersCount}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{org.stats.employeesCount}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>{org.stats.shiftsCount}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => {
                          setEditingOrg(org);
                          setNewCode(org.code);
                          setCodeError(null);
                        }}
                        title="Edit 4-digit code"
                        style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}
                      >
                        <Edit2 size={14} /> Edit Code
                      </button>
                      <button
                        type="button"
                        className="icon-button danger hard-delete-button"
                        onClick={() => {
                          setDeletingOrganisation(org);
                          setDeleteError(null);
                        }}
                        disabled={org.id === user?.organisationId}
                        title={org.id === user?.organisationId ? "Switch to another property before deleting this one" : "Permanently delete property"}
                        style={{
                          padding: "0.35rem 0.6rem",
                          fontSize: "0.8rem",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                          cursor: org.id === user?.organisationId ? "not-allowed" : "pointer"
                        }}
                      >
                        <Trash2 size={14} /> DB
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!loading && (
        <div className="table-container" style={{ background: "var(--color-bg-surface, #ffffff)", border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "0.5rem", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.9rem" }}>
            <thead>
              <tr style={{ background: "var(--color-bg-muted, #f9fafb)", borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                <th style={{ padding: "0.75rem 1rem" }}>User</th>
                <th style={{ padding: "0.75rem 1rem" }}>Email</th>
                <th style={{ padding: "0.75rem 1rem" }}>Primary Property</th>
                <th style={{ padding: "0.75rem 1rem" }}>Property Access</th>
                <th style={{ padding: "0.75rem 1rem" }}>Status</th>
                <th style={{ padding: "0.75rem 1rem" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} style={{ borderBottom: "1px solid var(--color-border, #e5e7eb)" }}>
                  <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>
                    <div>{user.name}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--color-text-secondary, #6b7280)", fontFamily: "monospace" }}>{user.id}</div>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>{user.email}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>[{user.primaryOrganisation.code}] {user.primaryOrganisation.name}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem" }}>
                      {user.memberships.map((membership) => (
                        <span
                          key={membership.organisation.id}
                          style={{
                            border: "1px solid var(--color-border, #e5e7eb)",
                            borderRadius: "0.25rem",
                            padding: "0.2rem 0.4rem",
                            background: "var(--color-bg-muted, #f3f4f6)",
                            fontSize: "0.75rem"
                          }}
                        >
                          [{membership.organisation.code}] {membership.role.replace("_", " ")}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "0.75rem 1rem" }}>{user.isActive ? "Active" : "Inactive"}</td>
                  <td style={{ padding: "0.75rem 1rem" }}>
                    <button
                      type="button"
                      className="icon-button danger hard-delete-button"
                      onClick={() => {
                        setDeletingUser(user);
                        setDeleteError(null);
                      }}
                      title="Permanently delete user"
                      style={{ padding: "0.35rem 0.6rem", fontSize: "0.8rem", display: "inline-flex", alignItems: "center", gap: "0.3rem", cursor: "pointer" }}
                    >
                      <Trash2 size={14} /> DB
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {deletingOrganisation && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="modal-card" style={{ background: "var(--color-bg-surface, #ffffff)", padding: "1.5rem", borderRadius: "0.75rem", maxWidth: "460px", width: "90%" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              <AlertTriangle size={22} />
              Delete property from database?
            </h2>
            <p style={{ fontSize: "0.9rem", color: "var(--color-text-secondary, #6b7280)", marginBottom: "1rem" }}>
              {propertyLabel(deletingOrganisation)} will be permanently deleted with its users, departments, employees, shifts, markers, validation rules, roster locks, and audit logs. This cannot be undone.
            </p>
            {deleteError && <div className="form-error">{deleteError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="button" className="secondary-button" onClick={() => setDeletingOrganisation(null)}>
                Cancel
              </button>
              <button type="button" className="danger-button" onClick={() => void handleDeleteOrganisation()} disabled={deleteSubmitting}>
                {deleteSubmitting ? "Deleting..." : "Delete from DB"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingUser && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="modal-card" style={{ background: "var(--color-bg-surface, #ffffff)", padding: "1.5rem", borderRadius: "0.75rem", maxWidth: "460px", width: "90%" }}>
            <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.75rem" }}>
              <AlertTriangle size={22} />
              Delete user from database?
            </h2>
            <p style={{ fontSize: "0.9rem", color: "var(--color-text-secondary, #6b7280)", marginBottom: "1rem" }}>
              {deletingUser.name} ({deletingUser.email}) will be permanently deleted and removed from every property membership. This cannot be undone.
            </p>
            {deleteError && <div className="form-error">{deleteError}</div>}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1rem" }}>
              <button type="button" className="secondary-button" onClick={() => setDeletingUser(null)}>
                Cancel
              </button>
              <button type="button" className="danger-button" onClick={() => void handleDeleteUser()} disabled={deleteSubmitting}>
                {deleteSubmitting ? "Deleting..." : "Delete from DB"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Property Modal */}
      {showCreateModal && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="modal-card" style={{ background: "var(--color-bg-surface, #ffffff)", padding: "1.5rem", borderRadius: "0.75rem", maxWidth: "460px", width: "90%" }}>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.5rem" }}>Create Property</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary, #6b7280)", marginBottom: "1rem" }}>
              Create the property first. Add admins afterward from New Admin.
            </p>
            <form onSubmit={handleCreateOrg} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label>
                Property Name *
                <input required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="e.g. Sunset Resort" />
              </label>
              <label>
                4-Digit Property Code (Optional - auto-assigned if empty)
                <input maxLength={4} value={createForm.code} onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })} placeholder="e.g. 0002" />
              </label>
              <label>
                Timezone *
                <input required value={createForm.timezone} onChange={(e) => setCreateForm({ ...createForm, timezone: e.target.value })} />
              </label>

              {createError && <div className="form-error">{createError}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.5rem" }}>
                <button type="button" className="secondary-button" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={createSubmitting}>
                  {createSubmitting ? "Creating..." : "Create Property"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Admin Modal */}
      {showAdminModal && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="modal-card" style={{ background: "var(--color-bg-surface, #ffffff)", padding: "1.5rem", borderRadius: "0.75rem", maxWidth: "460px", width: "90%" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "1rem" }}>Create Property Admin</h2>
            <form onSubmit={handleCreateAdmin} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label>
                Property *
                <select required value={adminForm.organisationId} onChange={(e) => setAdminForm({ ...adminForm, organisationId: e.target.value })}>
                  <option value="">Select Property...</option>
                  {organisations.map((org) => (
                    <option key={org.id} value={org.id}>
                      [{org.code}] {org.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Admin Name *
                <input required value={adminForm.name} onChange={(e) => setAdminForm({ ...adminForm, name: e.target.value })} />
              </label>
              <label>
                Username
                <input value={adminForm.username} onChange={(e) => setAdminForm({ ...adminForm, username: e.target.value })} />
              </label>
              <label>
                Email *
                <input type="email" required value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} />
              </label>
              <label>
                Password *
                <input type="password" required minLength={8} value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} />
              </label>

              {adminError && <div className="form-error">{adminError}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button type="button" className="secondary-button" onClick={() => setShowAdminModal(false)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={adminSubmitting}>
                  {adminSubmitting ? "Creating..." : "Create Admin"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Code Modal */}
      {editingOrg && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="modal-card" style={{ background: "var(--color-bg-surface, #ffffff)", padding: "1.5rem", borderRadius: "0.75rem", maxWidth: "400px", width: "90%" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Edit Organisation Code</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary, #6b7280)", marginBottom: "1rem" }}>
              Update code for <strong>{editingOrg.name}</strong>. Must be a unique 4-digit number (0001-9999).
            </p>
            <form onSubmit={handleUpdateCode} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label>
                New 4-Digit Code
                <input required maxLength={4} value={newCode} onChange={(e) => setNewCode(e.target.value)} style={{ fontFamily: "monospace", fontSize: "1.1rem" }} />
              </label>

              {codeError && <div className="form-error">{codeError}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button type="button" className="secondary-button" onClick={() => setEditingOrg(null)}>Cancel</button>
                <button type="submit" className="primary-button" disabled={codeSubmitting}>
                  {codeSubmitting ? "Updating..." : "Save Code"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Grant Membership Modal */}
      {showMembershipModal && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="modal-card" style={{ background: "var(--color-bg-surface, #ffffff)", padding: "1.5rem", borderRadius: "0.75rem", maxWidth: "960px", width: "94vw", maxHeight: "90vh", overflow: "auto" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Assign User Access</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary, #6b7280)", marginBottom: "1rem" }}>
              Search by user, email, username, or property. Each user shows the property they were created under.
            </p>
            <form onSubmit={handleGrantMembership} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "1rem" }}>
                <section>
                  <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>User</div>
                  <div style={{ position: "relative", marginBottom: "0.5rem" }}>
                    <Search size={16} style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary, #6b7280)" }} />
                    <input
                      value={membershipUserQuery}
                      onChange={(e) => setMembershipUserQuery(e.target.value)}
                      placeholder="Search users, email, property"
                      style={{ width: "100%", paddingLeft: "2rem" }}
                    />
                  </div>
                  <div style={{ border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "0.5rem", overflow: "auto", maxHeight: "320px" }}>
                    {filteredMembershipUsers.length === 0 ? (
                      <div style={{ padding: "1rem", color: "var(--color-text-secondary, #6b7280)", fontSize: "0.85rem" }}>No users found.</div>
                    ) : (
                      filteredMembershipUsers.map((item) => {
                        const isSelected = membershipForm.userId === item.id;
                        const alreadyHasTarget = membershipForm.organisationId
                          ? item.memberships.some((membership) => membership.organisation.id === membershipForm.organisationId)
                          : false;

                        return (
                          <button
                            key={item.id}
                            type="button"
                            aria-pressed={isSelected}
                            onClick={() => {
                              setMembershipForm((form) => ({ ...form, userId: item.id }));
                              setMembershipError(null);
                              setMembershipSuccess(null);
                            }}
                            style={{
                              width: "100%",
                              display: "block",
                              textAlign: "left",
                              padding: "0.75rem",
                              border: 0,
                              borderBottom: "1px solid var(--color-border, #e5e7eb)",
                              background: isSelected ? "var(--color-primary-soft, #dbeafe)" : "transparent",
                              cursor: "pointer"
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                              <strong>{item.name}</strong>
                              {isSelected && <CheckCircle2 size={16} style={{ color: "var(--color-primary, #2563eb)", flex: "0 0 auto" }} />}
                            </div>
                            <div style={{ fontSize: "0.82rem", color: "var(--color-text-secondary, #6b7280)" }}>
                              {item.email}{item.username ? ` / ${item.username}` : ""}
                            </div>
                            <div style={{ fontSize: "0.8rem", marginTop: "0.25rem" }}>Primary: {propertyLabel(item.primaryOrganisation)}</div>
                            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem", marginTop: "0.4rem" }}>
                              {item.memberships.map((membership) => (
                                <span
                                  key={membership.organisation.id}
                                  style={{
                                    border: "1px solid var(--color-border, #e5e7eb)",
                                    borderRadius: "0.25rem",
                                    padding: "0.1rem 0.35rem",
                                    background: "var(--color-bg-muted, #f3f4f6)",
                                    fontSize: "0.72rem"
                                  }}
                                >
                                  {propertyLabel(membership.organisation)} {membership.role.replace("_", " ")}
                                </span>
                              ))}
                              {alreadyHasTarget && (
                                <span style={{ borderRadius: "0.25rem", padding: "0.1rem 0.35rem", background: "#dcfce7", color: "#166534", fontSize: "0.72rem" }}>
                                  Already assigned
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>

                <section>
                  <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Target Property</div>
                  <div style={{ position: "relative", marginBottom: "0.5rem" }}>
                    <Search size={16} style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--color-text-secondary, #6b7280)" }} />
                    <input
                      value={membershipPropertyQuery}
                      onChange={(e) => setMembershipPropertyQuery(e.target.value)}
                      placeholder="Search property code or name"
                      style={{ width: "100%", paddingLeft: "2rem" }}
                    />
                  </div>
                  <div style={{ border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "0.5rem", overflow: "auto", maxHeight: "320px" }}>
                    {filteredMembershipOrganisations.length === 0 ? (
                      <div style={{ padding: "1rem", color: "var(--color-text-secondary, #6b7280)", fontSize: "0.85rem" }}>No properties found.</div>
                    ) : (
                      filteredMembershipOrganisations.map((organisation) => {
                        const isSelected = membershipForm.organisationId === organisation.id;
                        const existingRole = selectedMembershipUser?.memberships.find((membership) => membership.organisation.id === organisation.id)?.role;
                        const identityConflict = findTargetIdentityConflict(selectedMembershipUser, organisation.id);
                        const isBlocked = Boolean(identityConflict);

                        return (
                          <button
                            key={organisation.id}
                            type="button"
                            aria-pressed={isSelected}
                            disabled={isBlocked}
                            onClick={() => {
                              setMembershipForm((form) => ({ ...form, organisationId: organisation.id }));
                              setMembershipError(null);
                              setMembershipSuccess(null);
                            }}
                            style={{
                              width: "100%",
                              display: "block",
                              textAlign: "left",
                              padding: "0.75rem",
                              border: 0,
                              borderBottom: "1px solid var(--color-border, #e5e7eb)",
                              background: isSelected ? "var(--color-primary-soft, #dbeafe)" : isBlocked ? "#fef2f2" : "transparent",
                              cursor: isBlocked ? "not-allowed" : "pointer",
                              opacity: isBlocked ? 0.72 : 1
                            }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", gap: "0.5rem", alignItems: "center" }}>
                              <strong>{propertyLabel(organisation)}</strong>
                              {isSelected && <CheckCircle2 size={16} style={{ color: "var(--color-primary, #2563eb)", flex: "0 0 auto" }} />}
                            </div>
                            <div style={{ fontSize: "0.82rem", color: "var(--color-text-secondary, #6b7280)" }}>
                              {organisation.timezone} / {organisation.stats.usersCount} users
                            </div>
                            {existingRole && (
                              <div style={{ color: "#166534", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                                Selected user already has {existingRole.replace("_", " ")} access here.
                              </div>
                            )}
                            {identityConflict && (
                              <div style={{ color: "#991b1b", fontSize: "0.8rem", marginTop: "0.25rem" }}>
                                Blocked: {identityConflict.name} ({identityConflict.email}) from {propertyLabel(identityConflict.primaryOrganisation)} already has access here.
                              </div>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>
              </div>

              <div>
                <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>Role</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {(["ADMIN", "ROSTER_MANAGER", "VIEWER"] as UserRole[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setMembershipForm((form) => ({ ...form, role }))}
                      className={membershipForm.role === role ? "primary-button" : "secondary-button"}
                      style={{ padding: "0.45rem 0.75rem" }}
                    >
                      {role.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              {selectedMembershipUser && selectedMembershipOrganisation && (
                <div style={{ border: "1px solid var(--color-border, #e5e7eb)", borderRadius: "0.5rem", padding: "0.75rem", background: "var(--color-bg-muted, #f9fafb)", fontSize: "0.9rem" }}>
                  <strong>{selectedMembershipUser.name}</strong> from {propertyLabel(selectedMembershipUser.primaryOrganisation)} will receive{" "}
                  <strong>{membershipForm.role.replace("_", " ")}</strong> access to <strong>{propertyLabel(selectedMembershipOrganisation)}</strong>.
                  {selectedUserCurrentMembership && (
                    <div style={{ color: "#166534", marginTop: "0.25rem" }}>
                      Existing access is {selectedUserCurrentMembership.role.replace("_", " ")}; saving updates that role.
                    </div>
                  )}
                  {selectedMembershipIdentityConflict && (
                    <div style={{ color: "#991b1b", marginTop: "0.25rem" }}>
                      Blocked by duplicate identity: {selectedMembershipIdentityConflict.name} ({selectedMembershipIdentityConflict.email}) from{" "}
                      {propertyLabel(selectedMembershipIdentityConflict.primaryOrganisation)} already has access there.
                    </div>
                  )}
                </div>
              )}

              {membershipError && <div className="form-error">{membershipError}</div>}
              {membershipSuccess && <div className="form-success" style={{ color: "#166534", background: "#dcfce7", padding: "0.5rem", borderRadius: "0.25rem" }}>{membershipSuccess}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button type="button" className="secondary-button" onClick={() => setShowMembershipModal(false)}>Close</button>
                <button
                  type="submit"
                  className="primary-button"
                  disabled={membershipSubmitting || !membershipForm.userId || !membershipForm.organisationId || Boolean(selectedMembershipIdentityConflict)}
                >
                  {membershipSubmitting ? "Assigning..." : "Assign Access"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Change Super Admin Credentials Modal */}
      {showPasswordModal && (
        <div className="modal-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div className="modal-card" style={{ background: "var(--color-bg-surface, #ffffff)", padding: "1.5rem", borderRadius: "0.75rem", maxWidth: "420px", width: "90%" }}>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, marginBottom: "0.5rem" }}>Super Admin Credentials</h2>
            <p style={{ fontSize: "0.85rem", color: "var(--color-text-secondary, #6b7280)", marginBottom: "1rem" }}>
              Update the username and optionally set a new password for this Super Admin account.
            </p>
            <form onSubmit={handleChangeCredentials} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              <label>
                Username *
                <input
                  required
                  maxLength={80}
                  value={superAdminUsername}
                  onChange={(e) => setSuperAdminUsername(e.target.value)}
                  placeholder="superadmin"
                />
              </label>
              <label>
                New Password
                <input
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                />
              </label>

              {passwordError && <div className="form-error">{passwordError}</div>}
              {passwordSuccess && <div className="form-success" style={{ color: "#166534", background: "#dcfce7", padding: "0.5rem", borderRadius: "0.25rem" }}>{passwordSuccess}</div>}

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem" }}>
                <button type="button" className="secondary-button" onClick={() => setShowPasswordModal(false)}>Close</button>
                <button type="submit" className="primary-button" disabled={passwordSubmitting}>
                  {passwordSubmitting ? "Updating..." : "Update Credentials"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function downloadSuperAdminOrganisationsExcel(organisations: SuperAdminOrganisation[]) {
  downloadExcelSheet({
    fileName: "super-admin-properties.xlsx",
    sheetName: "Properties",
    columns: SUPER_ADMIN_ORGANISATION_COLUMNS,
    rows: organisations
  });
}

function downloadSuperAdminUsersExcel(users: SuperAdminUser[]) {
  downloadExcelSheet({
    fileName: "super-admin-users.xlsx",
    sheetName: "Users",
    columns: SUPER_ADMIN_USER_COLUMNS,
    rows: users
  });
}

function formatPropertyLabel(organisation: { code: string; name: string }) {
  return `[${organisation.code}] ${organisation.name}`;
}

function formatMembershipLabel(membership: SuperAdminUser["memberships"][number]) {
  return `${formatPropertyLabel(membership.organisation)} - ${membership.role.replace("_", " ")} - ${membership.isActive ? "Active" : "Inactive"}`;
}

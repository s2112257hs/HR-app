import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Edit3, Eye, EyeOff, RotateCcw, Trash2, UserMinus } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../../api/client";
import { createUser, deactivateUser, fetchUsers, hardDeleteUser, restoreUser, updateUser, UserPayload } from "../../api/users";
import { User, UserRole } from "../../types/api";
import { friendlyApiFieldErrors, friendlyApiMessage } from "../../utilities/formErrors";
import { useAuth } from "../authentication/AuthProvider";

const userSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(150, "Name must be 150 characters or fewer."),
  username: z
    .string()
    .trim()
    .max(80, "Username must be 80 characters or fewer.")
    .regex(/^[a-zA-Z0-9._-]*$/, "Username can only contain letters, numbers, dots, underscores and hyphens.")
    .optional(),
  email: z.string().trim().min(1, "Email is required.").email("Enter a valid email address.").max(255, "Email must be 255 characters or fewer."),
  password: z
    .string()
    .refine((value) => value.length === 0 || value.length >= 8, "Password must be at least 8 characters."),
  role: z.enum(["ADMIN", "ROSTER_MANAGER", "VIEWER"])
});

type UserForm = z.infer<typeof userSchema>;

const blankForm: UserForm = {
  name: "",
  username: "",
  email: "",
  password: "",
  role: "VIEWER"
};

function propertyLabel(property?: { code: string; name: string } | null) {
  return property ? `${property.name} (${property.code})` : "Current property";
}

export function UsersPage() {
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [editing, setEditing] = useState<User | null>(null);
  const [confirmingHardDelete, setConfirmingHardDelete] = useState<User | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const usersQuery = useQuery({
    queryKey: ["users"],
    queryFn: fetchUsers
  });
  const form = useForm<UserForm>({
    resolver: zodResolver(userSchema),
    defaultValues: blankForm
  });

  useEffect(() => {
    form.reset(editing ? { name: editing.name, username: editing.username ?? "", email: editing.email, password: "", role: editing.role } : blankForm);
    setShowPassword(false);
  }, [editing, form]);

  const saveMutation = useMutation({
    mutationFn: (values: UserForm) => {
      if (!editing && values.password.length < 8) {
        throw new Error("CREATE_PASSWORD_TOO_SHORT");
      }

      const username = values.username?.trim().toLowerCase() || "";
      const payload: UserPayload = {
        name: values.name.trim(),
        email: values.email.trim(),
        role: values.role as UserRole,
        ...(values.password ? { password: values.password } : {})
      };
      if (!editing) {
        payload.organisationId = currentUser?.organisationId;
        if (username) {
          payload.username = username;
        }
        return createUser({ ...payload, password: values.password });
      }
      payload.username = username || null;
      return updateUser(editing.id, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setEditing(null);
      form.reset(blankForm);
    },
    onError: (error) => {
      if (error instanceof Error && error.message === "CREATE_PASSWORD_TOO_SHORT") {
        form.setError("password", { message: "Password must be at least 8 characters." });
        return;
      }

      if (error instanceof ApiError) {
        Object.entries(friendlyApiFieldErrors(error)).forEach(([field, message]) => {
          form.setError(field as keyof UserForm, { message });
        });
        form.setError("root", { message: friendlyApiMessage(error, "User could not be saved.") });
        return;
      }

      form.setError("root", { message: "User could not be saved." });
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] })
  });
  const restoreMutation = useMutation({
    mutationFn: restoreUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["users"] })
  });
  const hardDeleteMutation = useMutation({
    mutationFn: hardDeleteUser,
    onSuccess: async () => {
      setConfirmingHardDelete(null);
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      setDeleteError(friendlyApiMessage(error, "User could not be permanently deleted."));
    }
  });
  const isSuperAdmin = Boolean(currentUser?.isSuperAdmin);

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>Users</h1>
          <p>{usersQuery.data?.length ?? 0} accounts</p>
        </div>
      </header>
      <form className="panel form-panel" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
        <div className="form-panel-heading">
          <h2>{editing ? "Edit user" : "Create user"}</h2>
          {editing && (
            <button className="secondary-button" type="button" onClick={() => setEditing(null)}>
              Clear
            </button>
          )}
        </div>
        <div className="form-grid">
          <label>
            Name
            <input {...form.register("name")} />
            {form.formState.errors.name && <span className="field-error">{form.formState.errors.name.message}</span>}
          </label>
          <label>
            Email
            <input type="email" {...form.register("email")} />
            {form.formState.errors.email && <span className="field-error">{form.formState.errors.email.message}</span>}
          </label>
          <label>
            Username
            <input autoComplete="username" {...form.register("username")} />
            {form.formState.errors.username && <span className="field-error">{form.formState.errors.username.message}</span>}
          </label>
          <label>
            Password
            <span className="password-input-row">
              <input type={showPassword ? "text" : "password"} autoComplete="new-password" {...form.register("password")} />
              <button
                className="icon-button"
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                title={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </span>
            {form.formState.errors.password && <span className="field-error">{form.formState.errors.password.message}</span>}
          </label>
          <label>
            Role in this property
            <select {...form.register("role")}>
              <option value="ADMIN">ADMIN</option>
              <option value="ROSTER_MANAGER">ROSTER MANAGER</option>
              <option value="VIEWER">VIEWER</option>
            </select>
            {form.formState.errors.role && <span className="field-error">{form.formState.errors.role.message}</span>}
          </label>
        </div>
        {form.formState.errors.root && <div className="form-error">{form.formState.errors.root.message}</div>}
        <div className="dialog-actions">
          <button className="primary-button" type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (editing ? "Saving user..." : "Creating user...") : editing ? "Save user" : "Create user"}
          </button>
        </div>
      </form>
      {deleteError && <div className="form-error">{deleteError}</div>}
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Username</th>
              <th>Email</th>
              <th>Property access</th>
              <th>Role here</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {(usersQuery.data ?? []).map((user) => (
              <tr key={user.id}>
                <td>{user.name}</td>
                <td>{user.username}</td>
                <td>{user.email}</td>
                <td>
                  <div className="stacked-cell">
                    <strong>{propertyLabel(user.activeOrganisationAccess?.organisation)}</strong>
                    {user.primaryOrganisation && user.primaryOrganisation.id !== user.activeOrganisationAccess?.organisation.id && (
                      <span>Primary: {propertyLabel(user.primaryOrganisation)}</span>
                    )}
                  </div>
                </td>
                <td>{user.role.replace("_", " ")}</td>
                <td>{user.isActive ? "Active" : "Inactive"}</td>
                <td>
                  <div className="row-actions">
                    <button className="icon-button" type="button" onClick={() => setEditing(user)} aria-label="Edit user" title="Edit">
                      <Edit3 size={16} aria-hidden="true" />
                    </button>
                    {user.isActive ? (
                      <button
                        className="icon-button muted-danger"
                        type="button"
                        onClick={() => deactivateMutation.mutate(user.id)}
                        aria-label="Deactivate user"
                        title={deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
                        disabled={deactivateMutation.isPending}
                      >
                        <UserMinus size={16} aria-hidden="true" />
                      </button>
                    ) : (
                      <button
                        className="icon-button"
                        type="button"
                        onClick={() => restoreMutation.mutate(user.id)}
                        aria-label="Reactivate user"
                        title={restoreMutation.isPending ? "Reactivating..." : "Reactivate"}
                        disabled={restoreMutation.isPending}
                      >
                        <RotateCcw size={16} aria-hidden="true" />
                      </button>
                    )}
                    {isSuperAdmin && (
                      <button
                        className="icon-button danger hard-delete-button"
                        type="button"
                        onClick={() => setConfirmingHardDelete(user)}
                        aria-label="Permanently delete user"
                        title="Permanently delete from database"
                      >
                        <Trash2 size={15} aria-hidden="true" />
                        DB
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmingHardDelete && (
        <div className="modal-backdrop" role="presentation">
          <div className="dialog-panel warning-dialog" role="dialog" aria-modal="true" aria-labelledby="hard-delete-user-title">
            <div className="dialog-heading">
              <AlertTriangle size={22} aria-hidden="true" />
              <h2 id="hard-delete-user-title">Delete user from database?</h2>
            </div>
            <p className="dialog-note">
              {confirmingHardDelete.name} ({confirmingHardDelete.email}) will be permanently deleted. Their property access will be removed. This cannot be undone.
            </p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setConfirmingHardDelete(null)}>
                Cancel
              </button>
              <button className="danger-button" type="button" onClick={() => hardDeleteMutation.mutate(confirmingHardDelete.id)} disabled={hardDeleteMutation.isPending}>
                {hardDeleteMutation.isPending ? "Deleting..." : "Delete from DB"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

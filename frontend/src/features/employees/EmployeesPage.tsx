import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Trash2, Edit3, RotateCcw, Search, UserMinus } from "lucide-react";
import { type CSSProperties, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../../api/client";
import { fetchDepartments } from "../../api/departments";
import { createEmployee, deactivateEmployee, EmployeePayload, fetchEmployees, hardDeleteEmployee, restoreEmployee, updateEmployee } from "../../api/employees";
import { Employee } from "../../types/api";
import { friendlyApiFieldErrors, friendlyApiMessage } from "../../utilities/formErrors";
import { useAuth } from "../authentication/AuthProvider";

const employeeSchema = z.object({
  employeeNumber: z.string().max(50, "Employee number must be 50 characters or fewer.").optional(),
  firstName: z.string().trim().min(1, "First name is required.").max(100, "First name must be 100 characters or fewer."),
  lastName: z.string().max(100, "Last name must be 100 characters or fewer.").optional(),
  preferredName: z.string().max(100, "Preferred name must be 100 characters or fewer.").optional(),
  phone: z.string().max(50, "Phone must be 50 characters or fewer.").optional(),
  email: z.string().max(255, "Email must be 255 characters or fewer.").email("Enter a valid email address.").optional().or(z.literal("")),
  employmentType: z.string().max(50, "Employment type must be 50 characters or fewer.").optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Start date must use YYYY-MM-DD.").optional().or(z.literal("")),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "End date must use YYYY-MM-DD.").optional().or(z.literal("")),
  primaryDepartmentId: z.string().uuid("Choose a valid primary department.").optional().or(z.literal(""))
});

type EmployeeForm = z.infer<typeof employeeSchema>;

const blankForm: EmployeeForm = {
  employeeNumber: "",
  firstName: "",
  lastName: "",
  preferredName: "",
  phone: "",
  email: "",
  employmentType: "",
  startDate: "",
  endDate: "",
  primaryDepartmentId: ""
};

export function EmployeesPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Employee | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<Employee | null>(null);
  const [confirmingHardDelete, setConfirmingHardDelete] = useState<Employee | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const employeesQuery = useQuery({
    queryKey: ["employees", status, search],
    queryFn: () => fetchEmployees(status, search)
  });
  const departmentsQuery = useQuery({
    queryKey: ["departments", "active"],
    queryFn: () => fetchDepartments("active")
  });
  const form = useForm<EmployeeForm>({
    resolver: zodResolver(employeeSchema),
    defaultValues: blankForm
  });
  const isSuperAdmin = Boolean(user?.isSuperAdmin);
  const canEditExisting = user?.role === "ADMIN" || isSuperAdmin;

  useEffect(() => {
    if (!editing || !canEditExisting) {
      form.reset(blankForm);
      return;
    }
    form.reset({
      employeeNumber: editing.employeeNumber ?? "",
      firstName: editing.firstName,
      lastName: editing.lastName ?? "",
      preferredName: editing.preferredName ?? "",
      phone: editing.phone ?? "",
      email: editing.email ?? "",
      employmentType: editing.employmentType ?? "",
      startDate: editing.startDate?.slice(0, 10) ?? "",
      endDate: editing.endDate?.slice(0, 10) ?? "",
      primaryDepartmentId: editing.primaryDepartmentId ?? editing.primaryDepartment?.id ?? ""
    });
  }, [canEditExisting, editing, form]);

  const saveMutation = useMutation({
    mutationFn: (values: EmployeeForm) => {
      const payload = cleanEmployeePayload(values);
      return editing && canEditExisting ? updateEmployee(editing.id, payload) : createEmployee(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
      setEditing(null);
      form.reset(blankForm);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        Object.entries(friendlyApiFieldErrors(error)).forEach(([field, message]) => {
          form.setError(field as keyof EmployeeForm, { message });
        });
        form.setError("root", { message: friendlyApiMessage(error, "Employee could not be saved.") });
        return;
      }

      form.setError("root", { message: "Employee could not be saved." });
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateEmployee,
    onSuccess: async () => {
      setConfirmingDelete(null);
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ["employees"] });
    },
    onError: (error) => {
      setDeleteError(friendlyApiMessage(error, "Employee could not be deactivated."));
    }
  });

  const restoreMutation = useMutation({
    mutationFn: restoreEmployee,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] })
  });
  const hardDeleteMutation = useMutation({
    mutationFn: hardDeleteEmployee,
    onSuccess: async () => {
      setConfirmingHardDelete(null);
      setDeleteError(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
        queryClient.invalidateQueries({ queryKey: ["roster"] })
      ]);
    },
    onError: (error) => {
      setDeleteError(friendlyApiMessage(error, "Employee could not be permanently deleted."));
    }
  });

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>Employees</h1>
          <p>{employeesQuery.data?.length ?? 0} records</p>
        </div>
        <div className="toolbar">
          <div className="search-box">
            <Search size={16} aria-hidden="true" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search" />
          </div>
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </header>
      <form className="panel form-panel" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
        <div className="form-panel-heading">
          <h2>{editing && canEditExisting ? "Edit employee" : "Create employee"}</h2>
          {editing && canEditExisting && (
            <button className="secondary-button" type="button" onClick={() => setEditing(null)}>
              Clear
            </button>
          )}
        </div>
        <div className="form-grid three">
          <label>
            Employee number
            <input {...form.register("employeeNumber")} />
            {form.formState.errors.employeeNumber && <span className="field-error">{form.formState.errors.employeeNumber.message}</span>}
          </label>
          <label>
            <span>First name <span className="required-mark">*</span></span>
            <input {...form.register("firstName")} />
            {form.formState.errors.firstName && <span className="field-error">{form.formState.errors.firstName.message}</span>}
          </label>
          <label>
            Last name
            <input {...form.register("lastName")} />
            {form.formState.errors.lastName && <span className="field-error">{form.formState.errors.lastName.message}</span>}
          </label>
          <label>
            Preferred name
            <input {...form.register("preferredName")} />
            {form.formState.errors.preferredName && <span className="field-error">{form.formState.errors.preferredName.message}</span>}
          </label>
          <label>
            Phone
            <input {...form.register("phone")} />
            {form.formState.errors.phone && <span className="field-error">{form.formState.errors.phone.message}</span>}
          </label>
          <label>
            Email
            <input type="email" {...form.register("email")} />
            {form.formState.errors.email && <span className="field-error">{form.formState.errors.email.message}</span>}
          </label>
          <label>
            Employment type
            <input {...form.register("employmentType")} />
            {form.formState.errors.employmentType && <span className="field-error">{form.formState.errors.employmentType.message}</span>}
          </label>
          <label>
            Start date
            <input type="date" {...form.register("startDate")} />
            {form.formState.errors.startDate && <span className="field-error">{form.formState.errors.startDate.message}</span>}
          </label>
          <label>
            End date
            <input type="date" {...form.register("endDate")} />
            {form.formState.errors.endDate && <span className="field-error">{form.formState.errors.endDate.message}</span>}
          </label>
          <label>
            Primary department
            <select {...form.register("primaryDepartmentId")}>
              <option value="">No primary department</option>
              {(departmentsQuery.data ?? []).map((department) => (
                <option key={department.id} value={department.id}>
                  {department.shortCode} - {department.name}
                </option>
              ))}
            </select>
            {form.formState.errors.primaryDepartmentId && <span className="field-error">{form.formState.errors.primaryDepartmentId.message}</span>}
          </label>
        </div>
        {form.formState.errors.root && <div className="form-error">{form.formState.errors.root.message}</div>}
        <div className="dialog-actions">
          <button className="primary-button" type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (editing && canEditExisting ? "Saving employee..." : "Creating employee...") : editing && canEditExisting ? "Save employee" : "Create employee"}
          </button>
        </div>
      </form>
      {deleteError && <div className="form-error">{deleteError}</div>}
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Number</th>
              <th>Name</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Type</th>
              <th>Primary department</th>
              <th>Status</th>
              {canEditExisting && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {(employeesQuery.data ?? []).map((employee) => (
              <tr key={employee.id}>
                <td>{employee.employeeNumber}</td>
                <td>{employee.preferredName || [employee.firstName, employee.lastName].filter(Boolean).join(" ")}</td>
                <td>{employee.phone}</td>
                <td>{employee.email}</td>
                <td>{employee.employmentType}</td>
                <td>
                  {employee.primaryDepartment ? (
                    <span className="department-pill" style={{ "--department-colour": employee.primaryDepartment.colourHex } as CSSProperties}>
                      {employee.primaryDepartment.shortCode}
                    </span>
                  ) : (
                    ""
                  )}
                </td>
                <td>{employee.isActive ? "Active" : "Inactive"}</td>
                {canEditExisting && (
                  <td>
                    <div className="row-actions">
                      <button className="icon-button" type="button" onClick={() => setEditing(employee)} aria-label="Edit employee" title="Edit">
                        <Edit3 size={16} aria-hidden="true" />
                      </button>
                      {employee.isActive ? (
                        <button
                          className="icon-button muted-danger"
                          type="button"
                          onClick={() => setConfirmingDelete(employee)}
                          aria-label="Deactivate employee"
                          title="Deactivate"
                        >
                          <UserMinus size={16} aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => restoreMutation.mutate(employee.id)}
                          aria-label="Reactivate employee"
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
                          onClick={() => setConfirmingHardDelete(employee)}
                          aria-label="Permanently delete employee"
                          title="Permanently delete from database"
                        >
                          <Trash2 size={15} aria-hidden="true" />
                          DB
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {confirmingDelete && (
        <div className="modal-backdrop" role="presentation">
          <div className="dialog-panel warning-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-employee-title">
            <div className="dialog-heading">
              <AlertTriangle size={22} aria-hidden="true" />
              <h2 id="delete-employee-title">Deactivate employee?</h2>
            </div>
            <p className="dialog-note">
              {confirmingDelete.preferredName || [confirmingDelete.firstName, confirmingDelete.lastName].filter(Boolean).join(" ")} will no longer be available for new roster entries. Existing roster history will stay visible.
            </p>
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setConfirmingDelete(null)}>
                Cancel
              </button>
              <button className="danger-button" type="button" onClick={() => deactivateMutation.mutate(confirmingDelete.id)} disabled={deactivateMutation.isPending}>
                {deactivateMutation.isPending ? "Deactivating..." : "Deactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
      {confirmingHardDelete && (
        <div className="modal-backdrop" role="presentation">
          <div className="dialog-panel warning-dialog" role="dialog" aria-modal="true" aria-labelledby="hard-delete-employee-title">
            <div className="dialog-heading">
              <AlertTriangle size={22} aria-hidden="true" />
              <h2 id="hard-delete-employee-title">Delete employee from database?</h2>
            </div>
            <p className="dialog-note">
              {employeeDisplayName(confirmingHardDelete)} will be permanently deleted. This also deletes their shifts and day markers. This cannot be undone.
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

function employeeDisplayName(employee: Employee) {
  return employee.preferredName || [employee.firstName, employee.lastName].filter(Boolean).join(" ");
}

function cleanEmployeePayload(values: EmployeeForm): EmployeePayload {
  const payload = Object.entries(values).reduce<EmployeePayload>((payload, [key, value]) => {
    if (key === "primaryDepartmentId" || key === "employeeNumber") {
      return payload;
    }
    if (value && value.trim()) {
      return { ...payload, [key]: value.trim() };
    }
    return payload;
  }, { firstName: values.firstName.trim() });

  return {
    ...payload,
    employeeNumber: values.employeeNumber?.trim() ?? "",
    primaryDepartmentId: values.primaryDepartmentId || null
  };
}

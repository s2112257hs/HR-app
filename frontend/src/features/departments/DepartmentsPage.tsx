import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Edit3, RotateCcw, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError } from "../../api/client";
import { createDepartment, deactivateDepartment, DepartmentPayload, fetchDepartments, restoreDepartment, updateDepartment } from "../../api/departments";
import { Department } from "../../types/api";
import { friendlyApiFieldErrors, friendlyApiMessage } from "../../utilities/formErrors";
import { useAuth } from "../authentication/AuthProvider";

const departmentSchema = z.object({
  name: z.string().trim().min(1, "Department name is required.").max(100, "Department name must be 100 characters or fewer."),
  shortCode: z.string().trim().min(1, "Short code is required.").max(10, "Short code must be 10 characters or fewer."),
  colourHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Colour must be a valid #RRGGBB value.")
});

type DepartmentForm = z.infer<typeof departmentSchema>;

const blankForm: DepartmentForm = {
  name: "",
  shortCode: "",
  colourHex: "#2563EB"
};

const COLOUR_PALETTE = [
  { name: "Grey", shades: ["#111827", "#374151", "#6B7280", "#9CA3AF", "#D1D5DB"] },
  { name: "Red", shades: ["#7F1D1D", "#B91C1C", "#EF4444", "#F87171", "#FECACA"] },
  { name: "Orange", shades: ["#7C2D12", "#C2410C", "#F97316", "#FDBA74", "#FED7AA"] },
  { name: "Amber", shades: ["#78350F", "#B45309", "#F59E0B", "#FCD34D", "#FDE68A"] },
  { name: "Yellow", shades: ["#713F12", "#A16207", "#EAB308", "#FDE047", "#FEF08A"] },
  { name: "Green", shades: ["#14532D", "#15803D", "#22C55E", "#86EFAC", "#BBF7D0"] },
  { name: "Teal", shades: ["#134E4A", "#0F766E", "#14B8A6", "#5EEAD4", "#99F6E4"] },
  { name: "Blue", shades: ["#1E3A8A", "#2563EB", "#3B82F6", "#93C5FD", "#BFDBFE"] },
  { name: "Indigo", shades: ["#312E81", "#4F46E5", "#6366F1", "#A5B4FC", "#C7D2FE"] },
  { name: "Purple", shades: ["#581C87", "#7E22CE", "#A855F7", "#C084FC", "#E9D5FF"] }
];

export function DepartmentsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [status, setStatus] = useState("all");
  const [editing, setEditing] = useState<Department | null>(null);
  const [showColourPalette, setShowColourPalette] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<Department | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const departmentsQuery = useQuery({
    queryKey: ["departments", status],
    queryFn: () => fetchDepartments(status)
  });
  const form = useForm<DepartmentForm>({
    resolver: zodResolver(departmentSchema),
    defaultValues: blankForm
  });
  const colour = form.watch("colourHex");
  const normalizedColour = colour?.toUpperCase() ?? "#2563EB";
  const canEditExisting = user?.role === "ADMIN";

  useEffect(() => {
    form.reset(
      editing && canEditExisting
        ? {
            name: editing.name,
            shortCode: editing.shortCode,
            colourHex: editing.colourHex
          }
        : blankForm
    );
    setShowColourPalette(false);
  }, [canEditExisting, editing, form]);

  const saveMutation = useMutation({
    mutationFn: (values: DepartmentForm) => {
      const payload: DepartmentPayload = {
        name: values.name.trim(),
        shortCode: values.shortCode.trim().toUpperCase(),
        colourHex: values.colourHex.trim().toUpperCase()
      };
      return editing && canEditExisting ? updateDepartment(editing.id, payload) : createDepartment(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
      setEditing(null);
      form.reset(blankForm);
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        Object.entries(friendlyApiFieldErrors(error)).forEach(([field, message]) => {
          form.setError(field as keyof DepartmentForm, { message });
        });
        form.setError("root", { message: friendlyApiMessage(error, "Department could not be saved.") });
        return;
      }

      form.setError("root", { message: "Department could not be saved." });
    }
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateDepartment,
    onSuccess: async () => {
      setConfirmingDelete(null);
      setDeleteError(null);
      await queryClient.invalidateQueries({ queryKey: ["departments"] });
    },
    onError: (error) => {
      setDeleteError(friendlyApiMessage(error, "Department could not be deactivated."));
    }
  });
  const restoreMutation = useMutation({
    mutationFn: restoreDepartment,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["departments"] })
  });

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>Departments</h1>
          <p>{departmentsQuery.data?.length ?? 0} records</p>
        </div>
        <div className="toolbar">
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </header>
      <form className="panel form-panel" onSubmit={form.handleSubmit((values) => saveMutation.mutate(values))}>
        <div className="form-panel-heading">
          <h2>{editing && canEditExisting ? "Edit department" : "Create department"}</h2>
          {editing && canEditExisting && (
            <button className="secondary-button" type="button" onClick={() => setEditing(null)}>
              Clear
            </button>
          )}
        </div>
        <div className="form-grid department-form-grid">
          <label>
            <span>Department name <span className="required-mark">*</span></span>
            <input {...form.register("name")} />
            {form.formState.errors.name && <span className="field-error">{form.formState.errors.name.message}</span>}
          </label>
          <label>
            <span>Short code <span className="required-mark">*</span></span>
            <input
              maxLength={10}
              {...form.register("shortCode", {
                setValueAs: (value: string) => value.toUpperCase()
              })}
            />
            {form.formState.errors.shortCode && <span className="field-error">{form.formState.errors.shortCode.message}</span>}
          </label>
          <div className="colour-field">
            <span className="field-label">Colour <span className="required-mark">*</span></span>
            <div className="colour-menu">
              <div className="colour-input-row">
                <button
                  aria-label="Open department colour choices"
                  className="colour-box-button"
                  onClick={() => setShowColourPalette((value) => !value)}
                  style={{ background: normalizedColour }}
                  title="Open colour choices"
                  type="button"
                />
                <input
                  {...form.register("colourHex", {
                    setValueAs: (value: string) => value.toUpperCase()
                  })}
                  aria-label="Department colour hex code"
                />
                <button
                  aria-label="Open department colour choices"
                  className="colour-preview-button"
                  onClick={() => setShowColourPalette((value) => !value)}
                  type="button"
                >
                  <span className="colour-preview" style={{ background: normalizedColour }} />
                </button>
              </div>
              {showColourPalette && (
                <div className="colour-popover">
                  <div className="colour-palette" role="group" aria-label="Department colour palette">
                    {COLOUR_PALETTE.map((group) => (
                      <div className="colour-palette-column" key={group.name}>
                        {group.shades.map((swatch) => (
                          <button
                            aria-label={`${group.name} ${swatch}`}
                            className={`colour-swatch ${normalizedColour === swatch ? "selected" : ""}`}
                            key={swatch}
                            onClick={() => {
                              form.setValue("colourHex", swatch, { shouldDirty: true, shouldValidate: true });
                              setShowColourPalette(false);
                            }}
                            style={{ background: swatch }}
                            title={`${group.name} ${swatch}`}
                            type="button"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                  <label className="colour-custom-picker">
                    <span>More colours</span>
                    <input
                      className="colour-grid-control"
                      type="color"
                      value={normalizedColour}
                      onChange={(event) => form.setValue("colourHex", event.target.value.toUpperCase(), { shouldDirty: true, shouldValidate: true })}
                      aria-label="Pick department colour"
                    />
                  </label>
                </div>
              )}
            </div>
            {form.formState.errors.colourHex && <span className="field-error">{form.formState.errors.colourHex.message}</span>}
          </div>
        </div>
        {form.formState.errors.root && <div className="form-error">{form.formState.errors.root.message}</div>}
        <div className="dialog-actions">
          <button className="primary-button" type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (editing && canEditExisting ? "Saving department..." : "Creating department...") : editing && canEditExisting ? "Save department" : "Create department"}
          </button>
        </div>
      </form>
      {deleteError && <div className="form-error">{deleteError}</div>}
      <div className="table-panel">
        <table>
          <thead>
            <tr>
              <th>Colour</th>
              <th>Name</th>
              <th>Short code</th>
              <th>Status</th>
              {canEditExisting && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {(departmentsQuery.data ?? []).map((department) => (
              <tr key={department.id}>
                <td>
                  <span className="colour-chip" style={{ background: department.colourHex }} />
                </td>
                <td>{department.name}</td>
                <td>{department.shortCode}</td>
                <td>{department.isActive ? "Active" : "Inactive"}</td>
                {canEditExisting && (
                  <td>
                    <div className="row-actions">
                      <button className="icon-button" type="button" onClick={() => setEditing(department)} aria-label="Edit department" title="Edit">
                        <Edit3 size={16} aria-hidden="true" />
                      </button>
                      {department.isActive ? (
                        <button
                          className="icon-button danger"
                          type="button"
                          onClick={() => setConfirmingDelete(department)}
                          aria-label="Deactivate department"
                          title="Deactivate"
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </button>
                      ) : (
                        <button
                          className="icon-button"
                          type="button"
                          onClick={() => restoreMutation.mutate(department.id)}
                          aria-label="Reactivate department"
                          title={restoreMutation.isPending ? "Reactivating..." : "Reactivate"}
                          disabled={restoreMutation.isPending}
                        >
                          <RotateCcw size={16} aria-hidden="true" />
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
          <div className="dialog-panel warning-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-department-title">
            <div className="dialog-heading">
              <AlertTriangle size={22} aria-hidden="true" />
              <h2 id="delete-department-title">Deactivate department?</h2>
            </div>
            <p className="dialog-note">
              {confirmingDelete.name} will no longer be available for new roster entries. Existing roster history will stay visible.
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
    </section>
  );
}

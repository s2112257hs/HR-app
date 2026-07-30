import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Power, RotateCcw, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { fetchDepartments } from "../api/departments";
import {
  createValidationRule,
  deactivateValidationRule,
  fetchSettings,
  fetchValidationRules,
  reactivateValidationRule,
  updateSettings,
  updateValidationRule,
  type ValidationRulePayload
} from "../api/settings";
import { ValidationRule } from "../types/api";
import { useAuth } from "../features/authentication/AuthProvider";
import { friendlyApiMessage } from "../utilities/formErrors";

const EMPTY_RULE_FORM: ValidationRulePayload = {
  name: "",
  departmentId: "",
  startTime: "00:00",
  endTime: "23:59",
  minimumStaff: 1
};

export function SettingsPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: fetchSettings
  });
  const departmentsQuery = useQuery({
    queryKey: ["departments", "active"],
    queryFn: () => fetchDepartments("active")
  });
  const validationRulesQuery = useQuery({
    queryKey: ["validation-rules"],
    queryFn: fetchValidationRules
  });
  const [rdoTrackingStartDate, setRdoTrackingStartDate] = useState("");
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<ValidationRulePayload>(EMPTY_RULE_FORM);
  const [editingRule, setEditingRule] = useState<ValidationRule | null>(null);
  const [ruleMessage, setRuleMessage] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const activeDepartments = departmentsQuery.data ?? [];
  const rules = validationRulesQuery.data ?? [];
  const sortedRules = useMemo(
    () => [...rules].sort((left, right) => Number(right.isActive) - Number(left.isActive) || left.name.localeCompare(right.name)),
    [rules]
  );

  useEffect(() => {
    if (settingsQuery.data) {
      setRdoTrackingStartDate(settingsQuery.data.rdoTrackingStartDate);
    }
  }, [settingsQuery.data]);

  const saveSettingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: async (settings) => {
      setSettingsMessage("Settings saved.");
      setSettingsError(null);
      setRdoTrackingStartDate(settings.rdoTrackingStartDate);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["rdo-tracker"] })
      ]);
    },
    onError: (error) => {
      setSettingsMessage(null);
      setSettingsError(friendlyApiMessage(error, "Settings could not be saved."));
    }
  });
  const saveRuleMutation = useMutation({
    mutationFn: ({ id, payload }: { id?: string; payload: ValidationRulePayload }) =>
      id ? updateValidationRule(id, payload) : createValidationRule(payload),
    onSuccess: async () => {
      setRuleMessage(editingRule ? "Validation rule saved." : "Validation rule created.");
      setRuleError(null);
      setEditingRule(null);
      setRuleForm(EMPTY_RULE_FORM);
      await queryClient.invalidateQueries({ queryKey: ["validation-rules"] });
    },
    onError: (error) => {
      setRuleMessage(null);
      setRuleError(friendlyApiMessage(error, "Validation rule could not be saved."));
    }
  });
  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) => (active ? reactivateValidationRule(id) : deactivateValidationRule(id)),
    onSuccess: async (_rule, variables) => {
      setRuleMessage(variables.active ? "Validation rule reactivated." : "Validation rule deactivated.");
      setRuleError(null);
      await queryClient.invalidateQueries({ queryKey: ["validation-rules"] });
    },
    onError: (error) => {
      setRuleMessage(null);
      setRuleError(friendlyApiMessage(error, "Validation rule could not be changed."));
    }
  });

  const submitRule = () => {
    const error = validateRuleForm(ruleForm);
    setRuleMessage(null);
    setRuleError(error);
    if (error) {
      return;
    }

    saveRuleMutation.mutate({
      id: editingRule?.id,
      payload: {
        ...ruleForm,
        name: ruleForm.name.trim(),
        minimumStaff: Number(ruleForm.minimumStaff)
      }
    });
  };

  const startEditingRule = (rule: ValidationRule) => {
    setEditingRule(rule);
    setRuleForm({
      name: rule.name,
      departmentId: rule.departmentId,
      startTime: rule.startTime,
      endTime: rule.endTime,
      minimumStaff: rule.minimumStaff
    });
    setRuleMessage(null);
    setRuleError(null);
  };

  const cancelEditingRule = () => {
    setEditingRule(null);
    setRuleForm(EMPTY_RULE_FORM);
    setRuleError(null);
  };

  return (
    <section className="page-stack">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Account details, roster settings, and validation rules.</p>
        </div>
      </header>
      <div className="settings-layout">
        <section className="panel settings-account-panel">
          <div className="form-panel-heading">
            <h2>Account</h2>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Name</dt>
              <dd>{user?.name}</dd>
            </div>
            <div>
              <dt>Email</dt>
              <dd>{user?.email}</dd>
            </div>
            <div>
              <dt>Role</dt>
              <dd>{user?.role.replace("_", " ")}</dd>
            </div>
            <div>
              <dt>Organisation</dt>
              <dd>{settingsQuery.data?.name ?? "Loading..."}</dd>
            </div>
            <div>
              <dt>Timezone</dt>
              <dd>{settingsQuery.data?.timezone ?? "Loading..."}</dd>
            </div>
          </dl>
        </section>
        <form
          className="panel form-panel"
          onSubmit={(event) => {
            event.preventDefault();
            setSettingsMessage(null);
            setSettingsError(null);
            saveSettingsMutation.mutate({ rdoTrackingStartDate });
          }}
        >
          <div className="form-panel-heading">
            <h2>Roster Settings</h2>
          </div>
          {settingsQuery.isLoading && <div className="skeleton-panel compact" />}
          {settingsQuery.isError && (
            <div className="form-error">
              Settings could not be loaded.
              <button className="link-button" type="button" onClick={() => void settingsQuery.refetch()}>
                Retry
              </button>
            </div>
          )}
          {settingsQuery.data && (
            <>
              <label>
                RDO tracking start date <span className="required-mark">*</span>
                <input type="date" value={rdoTrackingStartDate} onChange={(event) => setRdoTrackingStartDate(event.target.value)} />
              </label>
              <p className="dialog-note">RDO owed is counted from this date, or from an employee's start date if they joined later.</p>
              {settingsMessage && <div className="form-success">{settingsMessage}</div>}
              {settingsError && <div className="form-error">{settingsError}</div>}
              <div className="dialog-actions">
                <button className="primary-button" type="submit" disabled={saveSettingsMutation.isPending}>
                  Save settings
                </button>
              </div>
            </>
          )}
        </form>
        <section className="panel form-panel validation-rules-panel">
          <div className="form-panel-heading">
            <div>
              <h2>Validation Rules</h2>
              <p className="dialog-note">Rules are checked before weekly PDFs are downloaded.</p>
            </div>
          </div>
          <form
            className="validation-rule-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitRule();
            }}
          >
            <div className="form-grid validation-rule-grid">
              <label>
                Rule name <span className="required-mark">*</span>
                <input value={ruleForm.name} onChange={(event) => setRuleForm({ ...ruleForm, name: event.target.value })} maxLength={120} />
              </label>
              <label>
                Department <span className="required-mark">*</span>
                <select value={ruleForm.departmentId} onChange={(event) => setRuleForm({ ...ruleForm, departmentId: event.target.value })}>
                  <option value="">Choose department</option>
                  {activeDepartments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start time <span className="required-mark">*</span>
                <input type="time" value={ruleForm.startTime} onChange={(event) => setRuleForm({ ...ruleForm, startTime: event.target.value })} />
              </label>
              <label>
                End time <span className="required-mark">*</span>
                <input type="time" value={ruleForm.endTime} onChange={(event) => setRuleForm({ ...ruleForm, endTime: event.target.value })} />
              </label>
              <label>
                Minimum staff <span className="required-mark">*</span>
                <input
                  type="number"
                  min={1}
                  value={ruleForm.minimumStaff}
                  onChange={(event) => setRuleForm({ ...ruleForm, minimumStaff: Number(event.target.value) })}
                />
              </label>
            </div>
            {ruleMessage && <div className="form-success">{ruleMessage}</div>}
            {ruleError && <div className="form-error">{ruleError}</div>}
            <div className="dialog-actions">
              {editingRule && (
                <button className="secondary-button" type="button" onClick={cancelEditingRule}>
                  <X size={16} aria-hidden="true" />
                  Cancel edit
                </button>
              )}
              <button className="primary-button" type="submit" disabled={saveRuleMutation.isPending}>
                {editingRule ? "Save rule" : "Create rule"}
              </button>
            </div>
          </form>
          {validationRulesQuery.isLoading && <div className="skeleton-panel compact" />}
          {validationRulesQuery.isError && (
            <div className="form-error">
              Validation rules could not be loaded.
              <button className="link-button" type="button" onClick={() => void validationRulesQuery.refetch()}>
                Retry
              </button>
            </div>
          )}
          {validationRulesQuery.data && (
            <div className="settings-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Department</th>
                    <th>Time</th>
                    <th>Minimum</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRules.length === 0 && (
                    <tr>
                      <td colSpan={6}>No validation rules yet.</td>
                    </tr>
                  )}
                  {sortedRules.map((rule) => (
                    <tr key={rule.id}>
                      <td>{rule.name}</td>
                      <td>
                        <span className="department-pill" style={{ "--department-colour": rule.department.colourHex } as CSSProperties}>
                          {rule.department.shortCode}
                        </span>
                      </td>
                      <td>
                        {rule.startTime} - {rule.endTime}
                      </td>
                      <td>{rule.minimumStaff}</td>
                      <td>
                        <span className={`status-pill ${rule.isActive ? "active" : "inactive"}`}>{rule.isActive ? "Active" : "Inactive"}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <button className="icon-button" type="button" title="Edit" aria-label="Edit" onClick={() => startEditingRule(rule)}>
                            <Pencil size={16} aria-hidden="true" />
                          </button>
                          {rule.isActive ? (
                            <button
                              className="icon-button danger"
                              type="button"
                              title="Deactivate"
                              aria-label="Deactivate"
                              onClick={() => toggleRuleMutation.mutate({ id: rule.id, active: false })}
                              disabled={toggleRuleMutation.isPending}
                            >
                              <Power size={16} aria-hidden="true" />
                            </button>
                          ) : (
                            <button
                              className="icon-button"
                              type="button"
                              title="Reactivate"
                              aria-label="Reactivate"
                              onClick={() => toggleRuleMutation.mutate({ id: rule.id, active: true })}
                              disabled={toggleRuleMutation.isPending}
                            >
                              <RotateCcw size={16} aria-hidden="true" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </section>
  );
}

function validateRuleForm(form: ValidationRulePayload) {
  if (!form.name.trim()) {
    return "Rule name is required.";
  }
  if (!form.departmentId) {
    return "Department is required.";
  }
  if (!form.startTime || !form.endTime) {
    return "Start and end time are required.";
  }
  if (ruleEndMinutes(form.endTime) <= timeToMinutes(form.startTime)) {
    return "End time must be later than start time.";
  }
  if (!Number.isInteger(Number(form.minimumStaff)) || Number(form.minimumStaff) < 1) {
    return "Minimum staff must be at least 1.";
  }

  return null;
}

function timeToMinutes(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function ruleEndMinutes(time: string) {
  return time === "23:59" ? 24 * 60 : timeToMinutes(time);
}

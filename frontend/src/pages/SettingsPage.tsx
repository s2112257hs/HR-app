import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Award, Building2, Globe2, Mail, Pencil, Power, RotateCcw, SquarePen, UserRound, Users, X } from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { fetchDepartments, reorderDepartments } from "../api/departments";
import { fetchEmployees, reorderEmployees } from "../api/employees";
import {
  createValidationRule,
  deactivateValidationRule,
  fetchRdoBalances,
  fetchSettings,
  fetchValidationRules,
  reactivateValidationRule,
  updateRdoBalances,
  updateSettings,
  updateValidationRule,
  type RdoBalanceSetting,
  type ValidationRulePayload
} from "../api/settings";
import { Department, Employee, ValidationRule } from "../types/api";
import { useAuth } from "../features/authentication/AuthProvider";
import { friendlyApiMessage } from "../utilities/formErrors";

const EMPTY_RULE_FORM: ValidationRulePayload = {
  name: "",
  departmentId: "",
  startTime: "00:00",
  endTime: "23:59",
  minimumStaff: 1
};
const WEEK_START_OPTIONS = [
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
  { value: 7, label: "Sunday" }
];

type OrderModal = "departments" | "employees" | null;
type OrderDepartment = Pick<Department, "id" | "name" | "shortCode" | "colourHex">;
type DragPlacement = "before" | "after";

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
  const departmentOrderQuery = useQuery({
    queryKey: ["departments", "all", "settings-order"],
    queryFn: () => fetchDepartments("all")
  });
  const employeeOrderQuery = useQuery({
    queryKey: ["employees", "active", "settings-order"],
    queryFn: () => fetchEmployees("active")
  });
  const rdoBalancesQuery = useQuery({
    queryKey: ["settings", "rdo-balances"],
    queryFn: fetchRdoBalances
  });
  const validationRulesQuery = useQuery({
    queryKey: ["validation-rules"],
    queryFn: fetchValidationRules
  });
  const [rdoTrackingStartDate, setRdoTrackingStartDate] = useState("");
  const [weekStartDay, setWeekStartDay] = useState(1);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<ValidationRulePayload>(EMPTY_RULE_FORM);
  const [editingRule, setEditingRule] = useState<ValidationRule | null>(null);
  const [ruleMessage, setRuleMessage] = useState<string | null>(null);
  const [ruleError, setRuleError] = useState<string | null>(null);
  const [rdoBalances, setRdoBalances] = useState<RdoBalanceSetting[]>([]);
  const [rdoBalanceMessage, setRdoBalanceMessage] = useState<string | null>(null);
  const [rdoBalanceError, setRdoBalanceError] = useState<string | null>(null);
  const [rdoBalanceOpen, setRdoBalanceOpen] = useState(false);
  const [employeeOrder, setEmployeeOrder] = useState<Employee[]>([]);
  const [departmentOrder, setDepartmentOrder] = useState<Department[]>([]);
  const [orderModal, setOrderModal] = useState<OrderModal>(null);
  const [draggingOrderId, setDraggingOrderId] = useState<string | null>(null);
  const [orderMessage, setOrderMessage] = useState<string | null>(null);
  const [orderError, setOrderError] = useState<string | null>(null);
  const activeDepartments = departmentsQuery.data ?? [];
  const rules = validationRulesQuery.data ?? [];
  const sortedRules = useMemo(
    () => [...rules].sort((left, right) => Number(right.isActive) - Number(left.isActive) || left.name.localeCompare(right.name)),
    [rules]
  );
  const normalisedEmployeeOrder = useMemo(() => normaliseEmployeesToDepartmentOrder(employeeOrder, departmentOrder), [employeeOrder, departmentOrder]);
  const employeeGroups = useMemo(() => groupEmployeesByDepartment(normalisedEmployeeOrder, departmentOrder), [normalisedEmployeeOrder, departmentOrder]);

  useEffect(() => {
    if (settingsQuery.data) {
      setRdoTrackingStartDate(settingsQuery.data.rdoTrackingStartDate);
      setWeekStartDay(settingsQuery.data.weekStartDay);
    }
  }, [settingsQuery.data]);

  useEffect(() => {
    if (rdoBalancesQuery.data) {
      setRdoBalances(rdoBalancesQuery.data);
    }
  }, [rdoBalancesQuery.data]);

  useEffect(() => {
    if (employeeOrderQuery.data) {
      setEmployeeOrder(employeeOrderQuery.data);
    }
  }, [employeeOrderQuery.data]);

  useEffect(() => {
    if (departmentOrderQuery.data) {
      setDepartmentOrder(departmentOrderQuery.data);
    }
  }, [departmentOrderQuery.data]);

  const saveSettingsMutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: async (settings) => {
      setSettingsMessage("Settings saved.");
      setSettingsError(null);
      setRdoTrackingStartDate(settings.rdoTrackingStartDate);
      setWeekStartDay(settings.weekStartDay);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings"] }),
        queryClient.invalidateQueries({ queryKey: ["roster"] }),
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
  const saveRdoBalancesMutation = useMutation({
    mutationFn: () =>
      updateRdoBalances(
        rdoBalances.map((balance) => ({
          employeeId: balance.employeeId,
          rdoBalanceBroughtForward: Number(balance.rdoBalanceBroughtForward)
        }))
      ),
    onSuccess: async (balances) => {
      setRdoBalances(balances);
      setRdoBalanceMessage("RDO balances saved.");
      setRdoBalanceError(null);
      setRdoBalanceOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["settings", "rdo-balances"] }),
        queryClient.invalidateQueries({ queryKey: ["rdo-tracker"] })
      ]);
    },
    onError: (error) => {
      setRdoBalanceMessage(null);
      setRdoBalanceError(friendlyApiMessage(error, "RDO balances could not be saved."));
    }
  });
  const saveOrderMutation = useMutation({
    mutationFn: async () => {
      await reorderDepartments(departmentOrder.map((department) => department.id));
      return reorderEmployees(normaliseEmployeesToDepartmentOrder(employeeOrder, departmentOrder).map((employee) => employee.id));
    },
    onSuccess: async () => {
      setOrderMessage("Roster order saved.");
      setOrderError(null);
      setOrderModal(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["departments"] }),
        queryClient.invalidateQueries({ queryKey: ["employees"] }),
        queryClient.invalidateQueries({ queryKey: ["roster"] })
      ]);
    },
    onError: (error) => {
      setOrderMessage(null);
      setOrderError(friendlyApiMessage(error, "Roster order could not be saved."));
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

  const updateRdoBalance = (employeeId: string, value: number) => {
    setRdoBalances((balances) =>
      balances.map((balance) => (balance.employeeId === employeeId ? { ...balance, rdoBalanceBroughtForward: value } : balance))
    );
  };

  const moveEmployee = (sourceId: string, targetId: string, placement: DragPlacement) => {
    setEmployeeOrder((employees) => {
      const source = employees.find((employee) => employee.id === sourceId);
      const target = employees.find((employee) => employee.id === targetId);
      if (!source || !target) {
        return employees;
      }

      if (employeeDepartmentKey(source) !== employeeDepartmentKey(target)) {
        setOrderMessage(null);
        setOrderError("Employees can only be moved within their primary department group.");
        return employees;
      }

      setOrderError(null);
      return normaliseEmployeesToDepartmentOrder(moveItemAroundTarget(employees, sourceId, targetId, placement), departmentOrder);
    });
  };

  const moveDepartment = (sourceId: string, targetId: string, placement: DragPlacement) => {
    setDepartmentOrder((departments) => moveItemAroundTarget(departments, sourceId, targetId, placement));
  };

  return (
    <section className="page-stack settings-dashboard">
      <header className="page-header">
        <div>
          <h1>Settings</h1>
          <p>Account details, roster settings, and validation rules.</p>
        </div>
      </header>
      <div className="settings-layout">
        <section className="panel settings-account-panel">
          <div className="form-panel-heading">
            <h2>User Profile & Balances</h2>
          </div>
          <dl className="detail-list">
            <div>
              <UserRound size={18} aria-hidden="true" />
              <span>
                <dt>Name</dt>
                <dd>{user?.name}</dd>
              </span>
            </div>
            <div>
              <Mail size={18} aria-hidden="true" />
              <span>
                <dt>Email</dt>
                <dd>{user?.email}</dd>
              </span>
            </div>
            <div>
              <Award size={18} aria-hidden="true" />
              <span>
                <dt>Role</dt>
                <dd>{user?.role.replace("_", " ")}</dd>
              </span>
            </div>
            <div>
              <Building2 size={18} aria-hidden="true" />
              <span>
                <dt>Organisation</dt>
                <dd>{settingsQuery.data?.name ?? "Loading..."}</dd>
              </span>
            </div>
            <div>
              <Globe2 size={18} aria-hidden="true" />
              <span>
                <dt>Timezone</dt>
                <dd>{settingsQuery.data?.timezone ?? "Loading..."}</dd>
              </span>
            </div>
          </dl>
        </section>
        <form
          className="panel form-panel roster-management-panel combined-roster-settings-panel"
          onSubmit={(event) => {
            event.preventDefault();
            setSettingsMessage(null);
            setSettingsError(null);
            saveSettingsMutation.mutate({ rdoTrackingStartDate, weekStartDay });
          }}
        >
          <div className="combined-roster-settings-grid">
            <div className="settings-action-copy">
              <h2>Roster Settings & Management</h2>
              <h3>RDO Balance B/D</h3>
              <p className="dialog-note">Positive means RDO owed from before tracking started. Negative means RDO already given in advance.</p>
              <button className="secondary-button settings-action-button" type="button" onClick={() => setRdoBalanceOpen(true)}>
                <SquarePen size={16} aria-hidden="true" />
                Edit RDO balances
              </button>
              {settingsQuery.data && (
                <>
                  <label className="settings-date-field settings-subsection-gap">
                    <span className="label-title">
                      Week start day <span className="required-mark">*</span>
                    </span>
                    <select value={weekStartDay} onChange={(event) => setWeekStartDay(Number(event.target.value))}>
                      {WEEK_START_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="dialog-note">Weekly roster pages move in full weeks from this day.</p>
                </>
              )}
              {rdoBalanceMessage && <div className="form-success">{rdoBalanceMessage}</div>}
              {rdoBalanceError && <div className="form-error">{rdoBalanceError}</div>}
            </div>
            <div className="settings-action-copy">
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
                  <label className="settings-date-field">
                    <span className="label-title">
                      RDO tracking start date <span className="required-mark">*</span>
                    </span>
                    <input type="date" value={rdoTrackingStartDate} onChange={(event) => setRdoTrackingStartDate(event.target.value)} />
                  </label>
                  <p className="dialog-note">RDO owed is counted from this date, or from an employee's start date.</p>
                  <div className="settings-save-row">
                    <button className="primary-button roster-management-save" type="submit" disabled={saveSettingsMutation.isPending}>
                      {saveSettingsMutation.isPending ? "Saving settings..." : "Save settings"}
                    </button>
                  </div>
                </>
              )}
              <div className="roster-order-block">
                <h3>Roster Order</h3>
                <p className="dialog-note">This order is used in daily and weekly rosters.</p>
                <div className="roster-order-actions">
                  <button className="secondary-button" type="button" onClick={() => setOrderModal("departments")}>
                    <Building2 size={16} aria-hidden="true" />
                    Department order
                  </button>
                  <button className="secondary-button" type="button" onClick={() => setOrderModal("employees")}>
                    <Users size={16} aria-hidden="true" />
                    Employee order
                  </button>
                </div>
              </div>
            </div>
          </div>
          {settingsMessage && <div className="form-success">{settingsMessage}</div>}
          {settingsError && <div className="form-error">{settingsError}</div>}
          {orderMessage && <div className="form-success">{orderMessage}</div>}
          {orderError && <div className="form-error">{orderError}</div>}
        </form>
        {rdoBalanceOpen && (
          <div className="modal-backdrop" role="presentation">
            <div className="dialog-panel order-dialog" role="dialog" aria-modal="true">
              <div className="modal-title-row">
                <h2>RDO Balance B/D</h2>
                <button className="icon-button" type="button" onClick={() => setRdoBalanceOpen(false)} aria-label="Close">
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <p className="dialog-note">Positive means RDO owed from before tracking started. Negative means RDO already given in advance.</p>
              {rdoBalancesQuery.isLoading && <div className="skeleton-panel compact" />}
              {rdoBalancesQuery.isError && (
                <div className="form-error">
                  RDO balances could not be loaded.
                  <button className="link-button" type="button" onClick={() => void rdoBalancesQuery.refetch()}>
                    Retry
                  </button>
                </div>
              )}
              {rdoBalancesQuery.data && (
                <div className="settings-table-wrap order-dialog-list">
                  <table>
                    <thead>
                      <tr>
                        <th>Employee</th>
                        <th>Department</th>
                        <th>Balance b/d</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rdoBalances.map((balance) => (
                        <tr key={balance.employeeId}>
                          <td>{balance.displayName}</td>
                          <td>{balance.primaryDepartment?.shortCode ?? ""}</td>
                          <td>
                            <input
                              type="number"
                              step={1}
                              value={balance.rdoBalanceBroughtForward}
                              onChange={(event) => updateRdoBalance(balance.employeeId, Number(event.target.value))}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {rdoBalanceMessage && <div className="form-success">{rdoBalanceMessage}</div>}
              {rdoBalanceError && <div className="form-error">{rdoBalanceError}</div>}
              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={() => setRdoBalanceOpen(false)}>
                  Close
                </button>
                <button className="primary-button" type="button" onClick={() => saveRdoBalancesMutation.mutate()} disabled={saveRdoBalancesMutation.isPending}>
                  {saveRdoBalancesMutation.isPending ? "Saving RDO balances..." : "Save RDO balances"}
                </button>
              </div>
            </div>
          </div>
        )}
        {orderModal === "departments" && (
          <div className="modal-backdrop" role="presentation">
            <div className="dialog-panel order-dialog" role="dialog" aria-modal="true">
              <div className="modal-title-row">
                <h2>Department order</h2>
                <button className="icon-button" type="button" onClick={() => setOrderModal(null)} aria-label="Close">
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="draggable-list order-dialog-list">
                {departmentOrder.map((department) => (
                  <button
                    className="draggable-list-item"
                    draggable
                    key={department.id}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", department.id);
                      setDraggingOrderId(department.id);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      moveDepartment(draggingOrderId ?? event.dataTransfer.getData("text/plain"), department.id, dragPlacementFromEvent(event));
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      setDraggingOrderId(null);
                    }}
                    onDragEnd={() => setDraggingOrderId(null)}
                    type="button"
                  >
                    <span className="department-pill" style={{ "--department-colour": department.colourHex } as CSSProperties}>
                      {department.shortCode}
                    </span>
                    {department.name}
                  </button>
                ))}
              </div>
              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={() => setOrderModal(null)}>
                  Close
                </button>
                <button className="primary-button" type="button" onClick={() => saveOrderMutation.mutate()} disabled={saveOrderMutation.isPending}>
                  {saveOrderMutation.isPending ? "Saving roster order..." : "Save roster order"}
                </button>
              </div>
            </div>
          </div>
        )}
        {orderModal === "employees" && (
          <div className="modal-backdrop" role="presentation">
            <div className="dialog-panel order-dialog" role="dialog" aria-modal="true">
              <div className="modal-title-row">
                <h2>Employee order</h2>
                <button className="icon-button" type="button" onClick={() => setOrderModal(null)} aria-label="Close">
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div className="employee-order-groups">
                {employeeGroups.map((group) => (
                  <section className="employee-order-group" key={group.id}>
                    <h3>
                      {group.department && (
                        <span className="department-pill" style={{ "--department-colour": group.department.colourHex } as CSSProperties}>
                          {group.department.shortCode}
                        </span>
                      )}
                      {group.label}
                    </h3>
                    <div className="draggable-list">
                      {group.employees.map((employee) => (
                        <button
                          className="draggable-list-item employee-order-cell"
                          draggable
                          key={employee.id}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", employee.id);
                            setDraggingOrderId(employee.id);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            moveEmployee(draggingOrderId ?? event.dataTransfer.getData("text/plain"), employee.id, dragPlacementFromEvent(event));
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            setDraggingOrderId(null);
                          }}
                          onDragEnd={() => setDraggingOrderId(null)}
                          style={{ "--employee-department-colour": employee.primaryDepartment?.colourHex ?? "#94a3b8" } as CSSProperties}
                          type="button"
                        >
                          {employeeDisplayName(employee)}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={() => setOrderModal(null)}>
                  Close
                </button>
                <button className="primary-button" type="button" onClick={() => saveOrderMutation.mutate()} disabled={saveOrderMutation.isPending}>
                  {saveOrderMutation.isPending ? "Saving roster order..." : "Save roster order"}
                </button>
              </div>
            </div>
          </div>
        )}
        <section className="panel form-panel validation-rules-panel validation-rules-create-panel">
          <div className="form-panel-heading">
            <div>
              <h2>Validation Rules Creation</h2>
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
                <span className="label-title">
                  Rule name <span className="required-mark">*</span>
                </span>
                <input value={ruleForm.name} onChange={(event) => setRuleForm({ ...ruleForm, name: event.target.value })} maxLength={120} />
              </label>
              <label>
                <span className="label-title">
                  Department <span className="required-mark">*</span>
                </span>
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
                <span className="label-title">
                  Start time <span className="required-mark">*</span>
                </span>
                <input type="time" value={ruleForm.startTime} onChange={(event) => setRuleForm({ ...ruleForm, startTime: event.target.value })} />
              </label>
              <label>
                <span className="label-title">
                  End time <span className="required-mark">*</span>
                </span>
                <input type="time" value={ruleForm.endTime} onChange={(event) => setRuleForm({ ...ruleForm, endTime: event.target.value })} />
              </label>
              <label>
                <span className="label-title">
                  Minimum staff <span className="required-mark">*</span>
                </span>
                <input
                  type="number"
                  min={1}
                  value={ruleForm.minimumStaff}
                  onChange={(event) => setRuleForm({ ...ruleForm, minimumStaff: Number(event.target.value) })}
                />
              </label>
              <button className="primary-button" type="submit" disabled={saveRuleMutation.isPending}>
                {saveRuleMutation.isPending ? (editingRule ? "Saving rule..." : "Creating rule...") : editingRule ? "Save rule" : "Create rule"}
              </button>
            </div>
            {ruleMessage && <div className="form-success">{ruleMessage}</div>}
            {ruleError && <div className="form-error">{ruleError}</div>}
            {editingRule && (
              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={cancelEditingRule}>
                  <X size={16} aria-hidden="true" />
                  Cancel edit
                </button>
              </div>
            )}
          </form>
        </section>
        <section className="panel form-panel validation-rules-panel validation-rules-list-panel">
          <div className="form-panel-heading">
            <h2>Current Validation Rules List</h2>
          </div>
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
                      <td>{rule.department.name}</td>
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
                              title={toggleRuleMutation.isPending ? "Deactivating..." : "Deactivate"}
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
                              title={toggleRuleMutation.isPending ? "Reactivating..." : "Reactivate"}
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

function employeeDisplayName(employee: Employee) {
  return employee.preferredName || [employee.firstName, employee.lastName].filter(Boolean).join(" ");
}

function employeeDepartmentKey(employee: Employee) {
  return employee.primaryDepartmentId ?? employee.primaryDepartment?.id ?? "unassigned";
}

function normaliseEmployeesToDepartmentOrder(employees: Employee[], departments: Department[]) {
  const departmentRank = new Map(departments.map((department, index) => [department.id, index]));
  return [...employees].sort((left, right) => {
    const leftRank = departmentRank.get(employeeDepartmentKey(left)) ?? Number.MAX_SAFE_INTEGER;
    const rightRank = departmentRank.get(employeeDepartmentKey(right)) ?? Number.MAX_SAFE_INTEGER;
    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return employees.findIndex((employee) => employee.id === left.id) - employees.findIndex((employee) => employee.id === right.id);
  });
}

function groupEmployeesByDepartment(employees: Employee[], departments: Department[]) {
  const departmentsById = new Map<string, OrderDepartment>(departments.map((department) => [department.id, department]));
  const groups = new Map<string, { id: string; label: string; department: OrderDepartment | null; employees: Employee[] }>();

  departments.forEach((department) => {
    groups.set(department.id, {
      id: department.id,
      label: department.name,
      department,
      employees: []
    });
  });

  employees.forEach((employee) => {
    const key = employeeDepartmentKey(employee);
    const department = departmentsById.get(key) ?? employee.primaryDepartment ?? null;
    if (!groups.has(key)) {
      groups.set(key, {
        id: key,
        label: department?.name ?? "No primary department",
        department,
        employees: []
      });
    }
    groups.get(key)?.employees.push(employee);
  });

  return Array.from(groups.values()).filter((group) => group.employees.length > 0);
}

function dragPlacementFromEvent(event: DragEvent<HTMLElement>): DragPlacement {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2 ? "after" : "before";
}

function moveItemAroundTarget<T extends { id: string }>(items: T[], sourceId: string, targetId: string, placement: DragPlacement) {
  if (!sourceId || sourceId === targetId) {
    return items;
  }

  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) {
    return items;
  }

  const next = [...items];
  const [source] = next.splice(sourceIndex, 1);
  const insertIndex = next.findIndex((item) => item.id === targetId);
  next.splice(placement === "after" ? insertIndex + 1 : insertIndex, 0, source);
  return next;
}

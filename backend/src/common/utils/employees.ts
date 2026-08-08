export type EmployeeSortItem = {
  displayOrder: number;
  firstName: string;
  primaryDepartment: { displayOrder: number; name: string } | null;
};

export type EmployeeNameItem = {
  firstName: string;
  lastName?: string | null;
  preferredName?: string | null;
};

export function sortByPrimaryDepartment<T extends EmployeeSortItem>(employees: T[]) {
  return employees.sort((left, right) => {
    const departmentOrder = (left.primaryDepartment?.displayOrder ?? Number.MAX_SAFE_INTEGER) - (right.primaryDepartment?.displayOrder ?? Number.MAX_SAFE_INTEGER);
    if (departmentOrder !== 0) {
      return departmentOrder;
    }

    const departmentName = (left.primaryDepartment?.name ?? "").localeCompare(right.primaryDepartment?.name ?? "");
    if (departmentName !== 0) {
      return departmentName;
    }

    if (left.displayOrder !== right.displayOrder) {
      return left.displayOrder - right.displayOrder;
    }

    return left.firstName.localeCompare(right.firstName);
  });
}

export function employeeDisplayName(employee: EmployeeNameItem) {
  return employee.preferredName || [employee.firstName, employee.lastName].filter(Boolean).join(" ");
}

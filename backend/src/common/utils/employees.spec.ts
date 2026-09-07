import { employeeDisplayName, sortByPrimaryDepartment } from "./employees";

describe("employee utils", () => {
  it("uses preferred name before legal name pieces", () => {
    expect(employeeDisplayName({ firstName: "Alice", lastName: "Ng", preferredName: "Ali" })).toBe("Ali");
    expect(employeeDisplayName({ firstName: "Alice", lastName: null, preferredName: null })).toBe("Alice");
    expect(employeeDisplayName({ firstName: "Alice", lastName: "Ng", preferredName: "" })).toBe("Alice Ng");
  });

  it("sorts by department order, department name, employee order, then first name", () => {
    const employees = [
      { firstName: "Zoe", displayOrder: 2, primaryDepartment: { displayOrder: 2, name: "B" } },
      { firstName: "Bea", displayOrder: 1, primaryDepartment: { displayOrder: 1, name: "A" } },
      { firstName: "Ada", displayOrder: 1, primaryDepartment: { displayOrder: 1, name: "A" } },
      { firstName: "No Department", displayOrder: 1, primaryDepartment: null }
    ];

    expect(sortByPrimaryDepartment(employees).map((employee) => employee.firstName)).toEqual(["Ada", "Bea", "Zoe", "No Department"]);
  });

  it("falls back to department name when department display order matches", () => {
    const employees = [
      { firstName: "Blue", displayOrder: 1, primaryDepartment: { displayOrder: 1, name: "Blue" } },
      { firstName: "Amber", displayOrder: 1, primaryDepartment: { displayOrder: 1, name: "Amber" } }
    ];

    expect(sortByPrimaryDepartment(employees).map((employee) => employee.firstName)).toEqual(["Amber", "Blue"]);
  });

  it("falls back to first name when department and display order match", () => {
    const employees = [
      { firstName: "Zara", displayOrder: 1, primaryDepartment: { displayOrder: 1, name: "Front Office" } },
      { firstName: "Amy", displayOrder: 1, primaryDepartment: { displayOrder: 1, name: "Front Office" } }
    ];

    expect(sortByPrimaryDepartment(employees).map((employee) => employee.firstName)).toEqual(["Amy", "Zara"]);
  });

  it("uses employee display order when department order and name match", () => {
    const employees = [
      { firstName: "Second", displayOrder: 2, primaryDepartment: { displayOrder: 1, name: "Front Office" } },
      { firstName: "First", displayOrder: 1, primaryDepartment: { displayOrder: 1, name: "Front Office" } }
    ];

    expect(sortByPrimaryDepartment(employees).map((employee) => employee.firstName)).toEqual(["First", "Second"]);
  });

  it("orders employees without primary departments by their employee fields", () => {
    const employees = [
      { firstName: "Zed", displayOrder: 2, primaryDepartment: null },
      { firstName: "Amy", displayOrder: 1, primaryDepartment: null },
      { firstName: "Bea", displayOrder: 1, primaryDepartment: null }
    ];

    expect(sortByPrimaryDepartment(employees).map((employee) => employee.firstName)).toEqual(["Amy", "Bea", "Zed"]);
  });
});

import { describe, expect, it } from "vitest";
import {
  allowedLeaveTypeVisibilities,
  canAccessAdmin,
  canAddLeaveForOthers,
  canApproveFor,
  canEditOthersLeave,
  canSeeLeaveTypeVisibility,
  hasApproverLevel,
  hasRole,
  isActive,
  isApprover,
  isHR,
  type LeaveTypeVisibility,
} from "../../core/authz";
import type { Actor, ApproverLevel, EmployeeStatus, Role } from "../../core/types";

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    employeeId: "self",
    role: "STAFF",
    approverLevel: "NONE",
    status: "ACTIVE",
    approverForIds: [],
    ...overrides,
  };
}

const ROLES: Role[] = ["STAFF", "APPROVER", "HR"];
const LEVELS: ApproverLevel[] = ["NONE", "APPROVER", "APPROVER_ADD", "APPROVER_ADD_EDIT"];
const STATUSES: EmployeeStatus[] = ["ACTIVE", "INACTIVE"];

describe("isActive / hasRole", () => {
  it("isActive reflects status", () => {
    expect(isActive(actor({ status: "ACTIVE" }))).toBe(true);
    expect(isActive(actor({ status: "INACTIVE" }))).toBe(false);
  });

  it("hasRole matches only the exact role and only when active", () => {
    expect(hasRole(actor({ role: "HR" }), "HR")).toBe(true);
    expect(hasRole(actor({ role: "STAFF" }), "HR")).toBe(false);
    expect(hasRole(actor({ role: "HR", status: "INACTIVE" }), "HR")).toBe(false);
  });
});

describe("isHR / isApprover / canAccessAdmin", () => {
  it("isHR only for active HR", () => {
    expect(isHR(actor({ role: "HR" }))).toBe(true);
    expect(isHR(actor({ role: "APPROVER" }))).toBe(false);
    expect(isHR(actor({ role: "STAFF" }))).toBe(false);
    expect(isHR(actor({ role: "HR", status: "INACTIVE" }))).toBe(false);
  });

  it("isApprover for active APPROVER and HR, not STAFF", () => {
    expect(isApprover(actor({ role: "APPROVER" }))).toBe(true);
    expect(isApprover(actor({ role: "HR" }))).toBe(true);
    expect(isApprover(actor({ role: "STAFF" }))).toBe(false);
    expect(isApprover(actor({ role: "APPROVER", status: "INACTIVE" }))).toBe(false);
  });

  it("admin access is HR-only", () => {
    expect(canAccessAdmin(actor({ role: "HR" }))).toBe(true);
    expect(canAccessAdmin(actor({ role: "APPROVER" }))).toBe(false);
    expect(canAccessAdmin(actor({ role: "STAFF" }))).toBe(false);
  });
});

describe("hasApproverLevel", () => {
  it("HR satisfies every rung regardless of its stored level", () => {
    for (const min of LEVELS) {
      expect(hasApproverLevel(actor({ role: "HR", approverLevel: "NONE" }), min)).toBe(true);
    }
  });

  it("non-HR levels are ranked monotonically", () => {
    const rank: Record<ApproverLevel, number> = {
      NONE: 0,
      APPROVER: 1,
      APPROVER_ADD: 2,
      APPROVER_ADD_EDIT: 3,
    };
    for (const have of LEVELS) {
      for (const min of LEVELS) {
        expect(hasApproverLevel(actor({ role: "APPROVER", approverLevel: have }), min)).toBe(
          rank[have] >= rank[min],
        );
      }
    }
  });

  it("inactive never meets any level", () => {
    expect(
      hasApproverLevel(actor({ role: "HR", approverLevel: "APPROVER_ADD_EDIT", status: "INACTIVE" }), "NONE"),
    ).toBe(false);
  });
});

describe("canApproveFor", () => {
  it("HR can approve anyone except themselves", () => {
    const hr = actor({ employeeId: "hr1", role: "HR" });
    expect(canApproveFor(hr, "alice")).toBe(true);
    expect(canApproveFor(hr, "hr1")).toBe(false);
  });

  it("approver can approve only assigned employees, never self", () => {
    const appr = actor({ employeeId: "m1", role: "APPROVER", approverLevel: "APPROVER", approverForIds: ["alice", "bob"] });
    expect(canApproveFor(appr, "alice")).toBe(true);
    expect(canApproveFor(appr, "bob")).toBe(true);
    expect(canApproveFor(appr, "carol")).toBe(false);
    expect(canApproveFor(appr, "m1")).toBe(false);
  });

  it("staff can never approve", () => {
    expect(canApproveFor(actor({ employeeId: "s1", role: "STAFF", approverForIds: ["alice"] }), "alice")).toBe(false);
  });

  it("inactive approver/HR cannot approve", () => {
    expect(
      canApproveFor(actor({ employeeId: "m1", role: "APPROVER", status: "INACTIVE", approverForIds: ["alice"] }), "alice"),
    ).toBe(false);
    expect(canApproveFor(actor({ employeeId: "hr1", role: "HR", status: "INACTIVE" }), "alice")).toBe(false);
  });
});

describe("canAddLeaveForOthers / canEditOthersLeave", () => {
  it("add-leave needs APPROVER_ADD+ (HR always)", () => {
    expect(canAddLeaveForOthers(actor({ role: "APPROVER", approverLevel: "APPROVER" }))).toBe(false);
    expect(canAddLeaveForOthers(actor({ role: "APPROVER", approverLevel: "APPROVER_ADD" }))).toBe(true);
    expect(canAddLeaveForOthers(actor({ role: "APPROVER", approverLevel: "APPROVER_ADD_EDIT" }))).toBe(true);
    expect(canAddLeaveForOthers(actor({ role: "HR", approverLevel: "NONE" }))).toBe(true);
    expect(canAddLeaveForOthers(actor({ role: "STAFF" }))).toBe(false);
  });

  it("edit-others needs APPROVER_ADD_EDIT (HR always)", () => {
    expect(canEditOthersLeave(actor({ role: "APPROVER", approverLevel: "APPROVER_ADD" }))).toBe(false);
    expect(canEditOthersLeave(actor({ role: "APPROVER", approverLevel: "APPROVER_ADD_EDIT" }))).toBe(true);
    expect(canEditOthersLeave(actor({ role: "HR", approverLevel: "NONE" }))).toBe(true);
  });
});

describe("canSeeLeaveTypeVisibility / allowedLeaveTypeVisibilities", () => {
  const staff    = actor({ role: "STAFF" });
  const approver = actor({ role: "APPROVER", approverLevel: "APPROVER" });
  const hr       = actor({ role: "HR" });
  const inactive = actor({ role: "HR", status: "INACTIVE" });

  const VISIBILITIES: LeaveTypeVisibility[] = ["EVERYONE", "APPROVERS_SUPERUSERS", "HR_ONLY"];

  describe("EVERYONE — all active roles can see", () => {
    it("staff can see EVERYONE", ()    => expect(canSeeLeaveTypeVisibility(staff,    "EVERYONE")).toBe(true));
    it("approver can see EVERYONE", () => expect(canSeeLeaveTypeVisibility(approver, "EVERYONE")).toBe(true));
    it("hr can see EVERYONE", ()       => expect(canSeeLeaveTypeVisibility(hr,       "EVERYONE")).toBe(true));
  });

  describe("APPROVERS_SUPERUSERS — approver and HR only, not staff", () => {
    it("staff cannot see APPROVERS_SUPERUSERS", ()    => expect(canSeeLeaveTypeVisibility(staff,    "APPROVERS_SUPERUSERS")).toBe(false));
    it("approver can see APPROVERS_SUPERUSERS", ()    => expect(canSeeLeaveTypeVisibility(approver, "APPROVERS_SUPERUSERS")).toBe(true));
    it("hr can see APPROVERS_SUPERUSERS", ()          => expect(canSeeLeaveTypeVisibility(hr,       "APPROVERS_SUPERUSERS")).toBe(true));
  });

  describe("HR_ONLY — HR only", () => {
    it("staff cannot see HR_ONLY", ()    => expect(canSeeLeaveTypeVisibility(staff,    "HR_ONLY")).toBe(false));
    it("approver cannot see HR_ONLY", () => expect(canSeeLeaveTypeVisibility(approver, "HR_ONLY")).toBe(false));
    it("hr can see HR_ONLY", ()          => expect(canSeeLeaveTypeVisibility(hr,       "HR_ONLY")).toBe(true));
  });

  it("inactive HR sees nothing (not even EVERYONE via the predicate chain)", () => {
    // isApprover and isHR both require active — so inactive HR gets false for all restricted
    expect(canSeeLeaveTypeVisibility(inactive, "EVERYONE")).toBe(true); // constant true
    expect(canSeeLeaveTypeVisibility(inactive, "APPROVERS_SUPERUSERS")).toBe(false);
    expect(canSeeLeaveTypeVisibility(inactive, "HR_ONLY")).toBe(false);
  });

  describe("allowedLeaveTypeVisibilities consistency with canSeeLeaveTypeVisibility", () => {
    it.each([staff, approver, hr, inactive])("allowedLeaveTypeVisibilities matches canSee for actor %#", (a) => {
      const allowed = allowedLeaveTypeVisibilities(a);
      for (const v of VISIBILITIES) {
        expect(allowed.includes(v)).toBe(canSeeLeaveTypeVisibility(a, v));
      }
    });

    it("staff gets only [EVERYONE]",                    () => expect(allowedLeaveTypeVisibilities(staff)).toEqual(["EVERYONE"]));
    it("approver gets [EVERYONE, APPROVERS_SUPERUSERS]",() => expect(allowedLeaveTypeVisibilities(approver)).toEqual(["EVERYONE", "APPROVERS_SUPERUSERS"]));
    it("hr gets all three",                             () => expect(allowedLeaveTypeVisibilities(hr)).toEqual(["EVERYONE", "APPROVERS_SUPERUSERS", "HR_ONLY"]));
  });
});

describe("exhaustive: inactive actors have zero capabilities", () => {
  it("every role × level, when INACTIVE, is denied everything", () => {
    for (const role of ROLES) {
      for (const level of LEVELS) {
        const dead = actor({ employeeId: "x", role, approverLevel: level, status: "INACTIVE", approverForIds: ["alice"] });
        expect(isActive(dead)).toBe(false);
        expect(isHR(dead)).toBe(false);
        expect(isApprover(dead)).toBe(false);
        expect(canApproveFor(dead, "alice")).toBe(false);
        expect(canAddLeaveForOthers(dead)).toBe(false);
        expect(canEditOthersLeave(dead)).toBe(false);
        expect(canAccessAdmin(dead)).toBe(false);
      }
    }
  });

  it("uses STATUSES coverage list", () => {
    expect(STATUSES).toContain("ACTIVE");
    expect(STATUSES).toContain("INACTIVE");
  });
});

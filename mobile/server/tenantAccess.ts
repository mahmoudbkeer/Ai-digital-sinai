export type TenantRole = "owner" | "admin" | "manager" | "staff" | "viewer";
export type TenantMembershipLike = { role: TenantRole; status: "active" | "invited" | "suspended" };
export type TenantPermission =
  | "business.read" | "business.update" | "customer.read" | "customer.manage"
  | "services.read" | "services.manage" | "orders.read" | "orders.manage"
  | "subscription.read" | "subscription.manage" | "ai.use" | "workspace.manage";

const ROLE_PERMISSIONS: Record<TenantRole, readonly TenantPermission[]> = {
  owner: ["business.read", "business.update", "customer.read", "customer.manage", "services.read", "services.manage", "orders.read", "orders.manage", "subscription.read", "subscription.manage", "ai.use", "workspace.manage"],
  admin: ["business.read", "business.update", "customer.read", "customer.manage", "services.read", "services.manage", "orders.read", "orders.manage", "subscription.read", "subscription.manage", "ai.use", "workspace.manage"],
  manager: ["business.read", "business.update", "customer.read", "customer.manage", "services.read", "services.manage", "orders.read", "orders.manage", "subscription.read", "ai.use", "workspace.manage"],
  staff: ["business.read", "customer.read", "customer.manage", "services.read", "orders.read", "orders.manage", "ai.use"],
  viewer: ["business.read", "customer.read", "services.read", "orders.read", "subscription.read", "ai.use"],
};

export function hasTenantPermission(membership: TenantMembershipLike | undefined, permission: TenantPermission) {
  return membership?.status === "active" && ROLE_PERMISSIONS[membership.role].includes(permission);
}

export function canReadTenantData(membership: TenantMembershipLike | undefined) {
  return hasTenantPermission(membership, "business.read");
}

export function canWriteTenantData(membership: TenantMembershipLike | undefined) {
  return membership?.status === "active" && membership.role !== "viewer";
}

export function getTenantPermissions(role: TenantRole) {
  return ROLE_PERMISSIONS[role];
}

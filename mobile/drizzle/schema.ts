import { relations } from "drizzle-orm";
import {
  index,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
  decimal,
} from "drizzle-orm/mysql-core";

/** Core user table backing Manus OAuth. */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/** Public-facing profile data is separated from authentication and defaults to private. */
export const userProfiles = mysqlTable(
  "user_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    handle: varchar("handle", { length: 80 }).notNull(),
    displayName: varchar("displayName", { length: 160 }).notNull(),
    bio: text("bio"),
    avatarUrl: varchar("avatarUrl", { length: 500 }),
    coverUrl: varchar("coverUrl", { length: 500 }),
    accentColor: varchar("accentColor", { length: 20 }).default("#39c6b5").notNull(),
    city: varchar("city", { length: 120 }),
    websiteUrl: varchar("websiteUrl", { length: 500 }),
    showBio: int("showBio").default(1).notNull(),
    showCity: int("showCity").default(1).notNull(),
    showWebsite: int("showWebsite").default(1).notNull(),
    visibility: mysqlEnum("visibility", ["private", "public"]).default("private").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    userUnique: uniqueIndex("user_profiles_user_unique").on(table.userId),
    handleUnique: uniqueIndex("user_profiles_handle_unique").on(table.handle),
    visibilityHandleIdx: index("user_profiles_visibility_handle_idx").on(table.visibility, table.handle),
  }),
);
export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

/** A tenant is the security boundary for business data. */
export const tenants = mysqlTable(
  "tenants",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    status: mysqlEnum("status", ["active", "suspended", "archived"]).default("active").notNull(),
    ownerUserId: int("ownerUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ slugUnique: uniqueIndex("tenants_slug_unique").on(table.slug), ownerIdx: index("tenants_owner_idx").on(table.ownerUserId) }),
);

export type Tenant = typeof tenants.$inferSelect;
export type InsertTenant = typeof tenants.$inferInsert;

/** Membership binds a user to a tenant with least-privilege roles. */
export const tenantMembers = mysqlTable(
  "tenant_members",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id),
    userId: int("userId").notNull().references(() => users.id),
    role: mysqlEnum("role", ["owner", "admin", "manager", "staff", "viewer"]).default("viewer").notNull(),
    status: mysqlEnum("status", ["active", "invited", "suspended"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    membershipUnique: uniqueIndex("tenant_membership_unique").on(table.tenantId, table.userId),
    tenantIdx: index("tenant_members_tenant_idx").on(table.tenantId),
    userIdx: index("tenant_members_user_idx").on(table.userId),
  }),
);

export type TenantMember = typeof tenantMembers.$inferSelect;
export type InsertTenantMember = typeof tenantMembers.$inferInsert;

/** A business/store managed inside a tenant. */
export const businesses = mysqlTable(
  "businesses",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id),
    ownerUserId: int("ownerUserId").notNull().references(() => users.id),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 140 }).notNull(),
    description: text("description"),
    status: mysqlEnum("status", ["draft", "pending_review", "published", "suspended"]).default("draft").notNull(),
    city: varchar("city", { length: 120 }),
    district: varchar("district", { length: 120 }),
    latitude: decimal("latitude", { precision: 10, scale: 7 }),
    longitude: decimal("longitude", { precision: 10, scale: 7 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    tenantSlugUnique: uniqueIndex("businesses_tenant_slug_unique").on(table.tenantId, table.slug),
    tenantStatusIdx: index("businesses_tenant_status_idx").on(table.tenantId, table.status),
    ownerIdx: index("businesses_owner_idx").on(table.ownerUserId),
    locationIdx: index("businesses_location_idx").on(table.city, table.district),
  }),
);

export type Business = typeof businesses.$inferSelect;
export type InsertBusiness = typeof businesses.$inferInsert;

/** Provider profile keeps service-facing identity separate from user auth. */
export const providerProfiles = mysqlTable(
  "provider_profiles",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id),
    businessId: int("businessId").notNull().references(() => businesses.id),
    userId: int("userId").notNull().references(() => users.id),
    displayName: varchar("displayName", { length: 160 }).notNull(),
    bio: text("bio"),
    status: mysqlEnum("status", ["active", "pending", "suspended"]).default("pending").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    providerBusinessUnique: uniqueIndex("provider_profiles_business_user_unique").on(table.businessId, table.userId),
    providerTenantIdx: index("provider_profiles_tenant_idx").on(table.tenantId),
    providerUserIdx: index("provider_profiles_user_idx").on(table.userId),
  }),
);

export type ProviderProfile = typeof providerProfiles.$inferSelect;
export type InsertProviderProfile = typeof providerProfiles.$inferInsert;

export const subscriptionPlans = mysqlTable("subscription_plans", {
  id: int("id").autoincrement().primaryKey(),
  code: varchar("code", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 120 }).notNull(),
  description: text("description"),
  monthlyPrice: decimal("monthlyPrice", { precision: 10, scale: 2 }).notNull().default("0"),
  trialDays: int("trialDays").notNull().default(14),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;

export const subscriptions = mysqlTable("subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  planId: int("planId").notNull().references(() => subscriptionPlans.id),
  status: mysqlEnum("status", ["trial", "active", "expired", "cancelled"]).default("trial").notNull(),
  startedAt: timestamp("startedAt").defaultNow().notNull(),
  trialEndsAt: timestamp("trialEndsAt"),
  currentPeriodEndsAt: timestamp("currentPeriodEndsAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, table => ({ tenantStatusIdx: index("subscriptions_tenant_status_idx").on(table.tenantId, table.status) }));
export type Subscription = typeof subscriptions.$inferSelect;

export const serviceCategories = mysqlTable("service_categories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 120 }).notNull(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
});
export type ServiceCategory = typeof serviceCategories.$inferSelect;

export const services = mysqlTable("services", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  businessId: int("businessId").notNull().references(() => businesses.id),
  providerId: int("providerId").references(() => providerProfiles.id),
  categoryId: int("categoryId").references(() => serviceCategories.id),
  name: varchar("name", { length: 180 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ tenantStatusIdx: index("services_tenant_status_idx").on(table.tenantId, table.status), businessIdx: index("services_business_idx").on(table.businessId) }));
export type Service = typeof services.$inferSelect;

export const serviceRequests = mysqlTable("service_requests", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenantId").notNull().references(() => tenants.id),
  customerId: int("customerId").notNull().references(() => customers.id),
  serviceId: int("serviceId").notNull().references(() => services.id),
  status: mysqlEnum("status", ["new", "in_progress", "completed", "cancelled"]).default("new").notNull(),
  note: text("note"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
}, table => ({ tenantStatusIdx: index("service_requests_tenant_status_idx").on(table.tenantId, table.status) }));
export type ServiceRequest = typeof serviceRequests.$inferSelect;

/** Customer records belong to exactly one tenant and may optionally link to an authenticated user. */
export const customers = mysqlTable(
  "customers",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id),
    userId: int("userId").references(() => users.id),
    name: varchar("name", { length: 180 }).notNull(),
    email: varchar("email", { length: 320 }),
    phone: varchar("phone", { length: 40 }),
    status: mysqlEnum("status", ["active", "inactive", "blocked"]).default("active").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({
    tenantStatusIdx: index("customers_tenant_status_idx").on(table.tenantId, table.status),
    tenantEmailIdx: index("customers_tenant_email_idx").on(table.tenantId, table.email),
    userIdx: index("customers_user_idx").on(table.userId),
  }),
);

export type Customer = typeof customers.$inferSelect;
export type InsertCustomer = typeof customers.$inferInsert;

/** Governance events for system administration and security review. */
export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").references(() => tenants.id),
    actorUserId: int("actorUserId").notNull().references(() => users.id),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entityType", { length: 80 }).notNull(),
    entityId: int("entityId"),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({
    tenantCreatedIdx: index("audit_logs_tenant_created_idx").on(table.tenantId, table.createdAt),
    actorCreatedIdx: index("audit_logs_actor_created_idx").on(table.actorUserId, table.createdAt),
  }),
);

export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = typeof auditLogs.$inferInsert;

/** In-app notifications are always addressed to a user inside one tenant. */
export const notificationPreferences = mysqlTable(
  "notification_preferences",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id),
    userId: int("userId").notNull().references(() => users.id),
    marketplaceRequests: int("marketplaceRequests").notNull().default(1),
    subscriptionUpdates: int("subscriptionUpdates").notNull().default(1),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ uniqueUserTenant: uniqueIndex("notification_preferences_tenant_user_unique").on(table.tenantId, table.userId), userIdx: index("notification_preferences_user_idx").on(table.userId) }),
);
export type NotificationPreferences = typeof notificationPreferences.$inferSelect;
export type InsertNotificationPreferences = typeof notificationPreferences.$inferInsert;

export const notifications = mysqlTable(
  "notifications",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id),
    userId: int("userId").notNull().references(() => users.id),
    type: mysqlEnum("type", ["marketplace_request", "subscription_update", "system"]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    body: text("body").notNull(),
    readAt: timestamp("readAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ tenantUserCreatedIdx: index("notifications_tenant_user_created_idx").on(table.tenantId, table.userId, table.createdAt), unreadIdx: index("notifications_unread_idx").on(table.userId, table.readAt) }),
);
export type Notification = typeof notifications.$inferSelect;
export type InsertNotification = typeof notifications.$inferInsert;

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(userProfiles),
  ownedTenants: many(tenants),
  memberships: many(tenantMembers),
  ownedBusinesses: many(businesses),
  providerProfiles: many(providerProfiles),
  customers: many(customers),
  auditLogs: many(auditLogs),
  notificationPreferences: many(notificationPreferences),
  notifications: many(notifications),
}));

export const userProfilesRelations = relations(userProfiles, ({ one }) => ({
  user: one(users, { fields: [userProfiles.userId], references: [users.id] }),
}));

export const tenantsRelations = relations(tenants, ({ one, many }) => ({
  owner: one(users, { fields: [tenants.ownerUserId], references: [users.id] }),
  members: many(tenantMembers),
  businesses: many(businesses),
  providerProfiles: many(providerProfiles),
  customers: many(customers),
  auditLogs: many(auditLogs),
  notificationPreferences: many(notificationPreferences),
  notifications: many(notifications),
}));

export const tenantMembersRelations = relations(tenantMembers, ({ one }) => ({
  tenant: one(tenants, { fields: [tenantMembers.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [tenantMembers.userId], references: [users.id] }),
}));

export const businessesRelations = relations(businesses, ({ one, many }) => ({
  tenant: one(tenants, { fields: [businesses.tenantId], references: [tenants.id] }),
  owner: one(users, { fields: [businesses.ownerUserId], references: [users.id] }),
  providerProfiles: many(providerProfiles),
}));

export const providerProfilesRelations = relations(providerProfiles, ({ one }) => ({
  tenant: one(tenants, { fields: [providerProfiles.tenantId], references: [tenants.id] }),
  business: one(businesses, { fields: [providerProfiles.businessId], references: [businesses.id] }),
  user: one(users, { fields: [providerProfiles.userId], references: [users.id] }),
}));

export const customersRelations = relations(customers, ({ one }) => ({
  tenant: one(tenants, { fields: [customers.tenantId], references: [tenants.id] }),
  user: one(users, { fields: [customers.userId], references: [users.id] }),
}));

export const auditLogsRelations = relations(auditLogs, ({ one }) => ({
  tenant: one(tenants, { fields: [auditLogs.tenantId], references: [tenants.id] }),
  actor: one(users, { fields: [auditLogs.actorUserId], references: [users.id] }),
}));


/** Optional native push registrations; each token is scoped to a user and tenant. */
export const deviceTokens = mysqlTable(
  "device_tokens",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id),
    userId: int("userId").notNull().references(() => users.id),
    token: varchar("token", { length: 512 }).notNull(),
    platform: mysqlEnum("platform", ["android", "ios", "web"]).default("android").notNull(),
    enabled: int("enabled").default(1).notNull(),
    lastSeenAt: timestamp("lastSeenAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ tokenUnique: uniqueIndex("device_tokens_token_unique").on(table.token), tenantUserIdx: index("device_tokens_tenant_user_idx").on(table.tenantId, table.userId) }),
);
export type DeviceToken = typeof deviceTokens.$inferSelect;
export type InsertDeviceToken = typeof deviceTokens.$inferInsert;

/** Collaborative workspaces are tenant-owned project spaces. */
export const workspaces = mysqlTable(
  "workspaces",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id),
    ownerUserId: int("ownerUserId").notNull().references(() => users.id),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    status: mysqlEnum("status", ["active", "archived"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ tenantStatusIdx: index("workspaces_tenant_status_idx").on(table.tenantId, table.status) }),
);
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

export const workspaceMembers = mysqlTable(
  "workspace_members",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspaceId").notNull().references(() => workspaces.id),
    tenantId: int("tenantId").notNull().references(() => tenants.id),
    userId: int("userId").notNull().references(() => users.id),
    role: mysqlEnum("role", ["owner", "editor", "commenter", "viewer"]).default("viewer").notNull(),
    status: mysqlEnum("status", ["active", "invited", "revoked"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => ({ workspaceUserUnique: uniqueIndex("workspace_members_workspace_user_unique").on(table.workspaceId, table.userId), tenantUserIdx: index("workspace_members_tenant_user_idx").on(table.tenantId, table.userId) }),
);
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;

export const workspaceTasks = mysqlTable(
  "workspace_tasks",
  {
    id: int("id").autoincrement().primaryKey(),
    workspaceId: int("workspaceId").notNull().references(() => workspaces.id),
    tenantId: int("tenantId").notNull().references(() => tenants.id),
    assigneeUserId: int("assigneeUserId").references(() => users.id),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    title: varchar("title", { length: 180 }).notNull(),
    description: text("description"),
    status: mysqlEnum("status", ["todo", "in_progress", "done", "blocked"]).default("todo").notNull(),
    dueAt: timestamp("dueAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => ({ workspaceStatusIdx: index("workspace_tasks_workspace_status_idx").on(table.workspaceId, table.status), tenantIdx: index("workspace_tasks_tenant_idx").on(table.tenantId) }),
);
export type WorkspaceTask = typeof workspaceTasks.$inferSelect;
export type InsertWorkspaceTask = typeof workspaceTasks.$inferInsert;

import { and, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertBusiness,
  InsertCustomer,
  InsertProviderProfile,
  InsertTenant,
  serviceCategories,
  serviceRequests,
  services,
  subscriptionPlans,
  subscriptions,
  InsertUser,
  userProfiles,
  auditLogs,
  businesses,
  customers,
  providerProfiles,
  tenants,
  tenantMembers,
  users,
  notificationPreferences,
  notifications,
  InsertNotificationPreferences,
  deviceTokens,
  workspaces,
  workspaceMembers,
  workspaceTasks,
  Workspace,
  WorkspaceTask,
} from "../drizzle/schema";
import { ENV } from './_core/env';
import { BILLING_PERIOD_DAYS, getServerTrialDuration } from './subscriptionPolicy';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return result[0];
}

export async function upsertUserProfile(input: {
  userId: number;
  handle: string;
  displayName: string;
  bio?: string | null;
  avatarUrl?: string | null;
  city?: string | null;
  websiteUrl?: string | null;
  coverUrl?: string | null;
  accentColor?: string;
  showBio?: number;
  showCity?: number;
  showWebsite?: number;
  visibility: "private" | "public";
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values = {
    userId: input.userId,
    handle: input.handle,
    displayName: input.displayName,
    bio: input.bio ?? null,
    avatarUrl: input.avatarUrl ?? null,
    city: input.city ?? null,
    websiteUrl: input.websiteUrl ?? null,
    coverUrl: input.coverUrl ?? null,
    accentColor: input.accentColor ?? "#39c6b5",
    showBio: input.showBio ?? 1,
    showCity: input.showCity ?? 1,
    showWebsite: input.showWebsite ?? 1,
    visibility: input.visibility,
  } as const;
  await db.insert(userProfiles).values(values).onDuplicateKeyUpdate({
    set: {
      handle: values.handle,
      displayName: values.displayName,
      bio: values.bio,
      avatarUrl: values.avatarUrl,
      city: values.city,
      websiteUrl: values.websiteUrl,
      coverUrl: values.coverUrl,
      accentColor: values.accentColor,
      showBio: values.showBio,
      showCity: values.showCity,
      showWebsite: values.showWebsite,
      visibility: values.visibility,
      updatedAt: new Date(),
    },
  });
  return getUserProfile(input.userId);
}

export async function getPublicUserProfile(handle: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db
    .select({
      handle: userProfiles.handle,
      displayName: userProfiles.displayName,
      bio: sql`CASE WHEN ${userProfiles.showBio} = 1 THEN ${userProfiles.bio} ELSE NULL END`,
      avatarUrl: userProfiles.avatarUrl,
      coverUrl: userProfiles.coverUrl,
      accentColor: userProfiles.accentColor,
      city: sql`CASE WHEN ${userProfiles.showCity} = 1 THEN ${userProfiles.city} ELSE NULL END`,
      websiteUrl: sql`CASE WHEN ${userProfiles.showWebsite} = 1 THEN ${userProfiles.websiteUrl} ELSE NULL END`,
      visibility: userProfiles.visibility,
    })
    .from(userProfiles)
    .where(and(eq(userProfiles.handle, handle), eq(userProfiles.visibility, "public")))
    .limit(1);
  return result[0];
}

export async function listTenantsForUser(userId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select({
      id: tenants.id,
      name: tenants.name,
      slug: tenants.slug,
      status: tenants.status,
      role: tenantMembers.role,
      membershipStatus: tenantMembers.status,
      createdAt: tenants.createdAt,
    })
    .from(tenantMembers)
    .innerJoin(tenants, eq(tenantMembers.tenantId, tenants.id))
    .where(and(eq(tenantMembers.userId, userId), eq(tenantMembers.status, "active")));
}

export async function getTenantMembership(userId: number, tenantId: number) {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(tenantMembers)
    .where(
      and(
        eq(tenantMembers.userId, userId),
        eq(tenantMembers.tenantId, tenantId),
        eq(tenantMembers.status, "active"),
      ),
    )
    .limit(1);

  return result[0];
}

export async function createTenantWithOwner(input: {
  name: string;
  slug: string;
  ownerUserId: number;
}): Promise<{ tenantId: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");

  return db.transaction(async tx => {
    const tenantValues: InsertTenant = {
      name: input.name,
      slug: input.slug,
      ownerUserId: input.ownerUserId,
      status: "active",
    };
    const tenantInsert = await tx.insert(tenants).values(tenantValues);
    const tenantId = Number(tenantInsert[0].insertId);

    await tx.insert(tenantMembers).values({
      tenantId,
      userId: input.ownerUserId,
      role: "owner",
      status: "active",
    });

    return { tenantId };
  });
}

export async function listNotificationsForUser(input: { tenantId: number; userId: number; limit?: number }) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(notifications).where(and(eq(notifications.tenantId, input.tenantId), eq(notifications.userId, input.userId))).orderBy(desc(notifications.createdAt)).limit(input.limit ?? 30);
}

export async function markNotificationRead(input: { tenantId: number; userId: number; notificationId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, input.notificationId), eq(notifications.tenantId, input.tenantId), eq(notifications.userId, input.userId)));
  return { success: true as const };
}

export async function getNotificationPreferences(input: { tenantId: number; userId: number }) {
  const db = await getDb();
  if (!db) return { marketplaceRequests: 1, subscriptionUpdates: 1 };
  const rows = await db.select().from(notificationPreferences).where(and(eq(notificationPreferences.tenantId, input.tenantId), eq(notificationPreferences.userId, input.userId))).limit(1);
  return rows[0] ?? { marketplaceRequests: 1, subscriptionUpdates: 1 };
}

export async function updateNotificationPreferences(input: { tenantId: number; userId: number; marketplaceRequests: boolean; subscriptionUpdates: boolean }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertNotificationPreferences = { tenantId: input.tenantId, userId: input.userId, marketplaceRequests: input.marketplaceRequests ? 1 : 0, subscriptionUpdates: input.subscriptionUpdates ? 1 : 0 };
  await db.insert(notificationPreferences).values(values).onDuplicateKeyUpdate({ set: { marketplaceRequests: values.marketplaceRequests, subscriptionUpdates: values.subscriptionUpdates, updatedAt: new Date() } });
  return { success: true as const };
}

export async function createNotification(input: { tenantId: number; userId: number; type: "marketplace_request" | "subscription_update" | "system"; title: string; body: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const prefs = await getNotificationPreferences({ tenantId: input.tenantId, userId: input.userId });
  if (input.type === "marketplace_request" && !prefs.marketplaceRequests) return { created: false as const };
  if (input.type === "subscription_update" && !prefs.subscriptionUpdates) return { created: false as const };
  const result = await db.insert(notifications).values(input);
  return { created: true as const, notificationId: Number(result[0].insertId) };
}

export async function listBusinessesForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(businesses).where(eq(businesses.tenantId, tenantId));
}

export async function listProvidersForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(providerProfiles).where(eq(providerProfiles.tenantId, tenantId));
}

export async function listCustomersForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) return [];

  return db
    .select()
    .from(customers)
    .where(eq(customers.tenantId, tenantId));
}

export async function createCustomerForTenant(input: {
  tenantId: number;
  userId?: number;
  name: string;
  email?: string;
  phone?: string;
}) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertCustomer = { tenantId: input.tenantId, userId: input.userId, name: input.name, email: input.email, phone: input.phone, status: "active" };
  const result = await db.insert(customers).values(values);
  return { customerId: Number(result[0].insertId) };
}

export async function updateCustomerForTenant(input: { tenantId: number; customerId: number; name?: string; email?: string; phone?: string; status?: "active" | "inactive" | "blocked" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(customers).set(input).where(and(eq(customers.id, input.customerId), eq(customers.tenantId, input.tenantId)));
  return { success: true as const };
}

export async function deleteCustomerForTenant(input: { tenantId: number; customerId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(customers).where(and(eq(customers.id, input.customerId), eq(customers.tenantId, input.tenantId)));
  return { success: true as const };
}

export async function createBusinessForTenant(input: { tenantId: number; ownerUserId: number; name: string; slug: string; description?: string; city?: string; district?: string; latitude?: string; longitude?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const values: InsertBusiness = { tenantId: input.tenantId, ownerUserId: input.ownerUserId, name: input.name, slug: input.slug, description: input.description, city: input.city, district: input.district, latitude: input.latitude, longitude: input.longitude, status: "draft" };
  const result = await db.insert(businesses).values(values);
  return { businessId: Number(result[0].insertId) };
}

export async function updateBusinessForTenant(input: { tenantId: number; businessId: number; name?: string; description?: string; city?: string; district?: string; latitude?: string; longitude?: string; status?: "draft" | "pending_review" | "published" | "suspended" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(businesses).set(input).where(and(eq(businesses.id, input.businessId), eq(businesses.tenantId, input.tenantId)));
  return { success: true as const };
}

export async function deleteBusinessForTenant(input: { tenantId: number; businessId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(businesses).where(and(eq(businesses.id, input.businessId), eq(businesses.tenantId, input.tenantId)));
  return { success: true as const };
}

export async function getBusinessForTenant(tenantId: number, businessId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(businesses).where(and(eq(businesses.id, businessId), eq(businesses.tenantId, tenantId))).limit(1);
  return rows[0] ?? null;
}

export async function getProviderForTenantBusiness(tenantId: number, providerId: number, businessId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(providerProfiles).where(and(eq(providerProfiles.id, providerId), eq(providerProfiles.tenantId, tenantId), eq(providerProfiles.businessId, businessId))).limit(1);
  return rows[0] ?? null;
}

export async function getServiceForTenant(tenantId: number, serviceId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(services).where(and(eq(services.id, serviceId), eq(services.tenantId, tenantId))).limit(1);
  return rows[0] ?? null;
}

export async function getCustomerForTenant(tenantId: number, customerId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(customers).where(and(eq(customers.id, customerId), eq(customers.tenantId, tenantId))).limit(1);
  return rows[0] ?? null;
}

export async function getSubscriptionPlan(planId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(subscriptionPlans).where(and(eq(subscriptionPlans.id, planId), eq(subscriptionPlans.status, "active"))).limit(1);
  return rows[0] ?? null;
}

export async function getSubscriptionForTenant(tenantId: number, subscriptionId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(subscriptions).where(and(eq(subscriptions.id, subscriptionId), eq(subscriptions.tenantId, tenantId))).limit(1);
  return rows[0] ?? null;
}

export async function createProviderForTenant(input: { tenantId: number; businessId: number; userId: number; displayName: string; bio?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!(await getBusinessForTenant(input.tenantId, input.businessId))) throw new Error("Business does not belong to tenant");
  const values: InsertProviderProfile = { tenantId: input.tenantId, businessId: input.businessId, userId: input.userId, displayName: input.displayName, bio: input.bio, status: "pending" };
  const result = await db.insert(providerProfiles).values(values);
  return { providerId: Number(result[0].insertId) };
}

export async function updateProviderForTenant(input: { tenantId: number; providerId: number; displayName?: string; bio?: string; status?: "active" | "pending" | "suspended" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.update(providerProfiles).set(input).where(and(eq(providerProfiles.id, input.providerId), eq(providerProfiles.tenantId, input.tenantId)));
  return { success: true as const };
}

export async function deleteProviderForTenant(input: { tenantId: number; providerId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.delete(providerProfiles).where(and(eq(providerProfiles.id, input.providerId), eq(providerProfiles.tenantId, input.tenantId)));
  return { success: true as const };
}

export async function writeAuditLog(input: { tenantId?: number; actorUserId: number; action: string; entityType: string; entityId?: number; metadata?: Record<string, unknown> }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  await db.insert(auditLogs).values({ tenantId: input.tenantId, actorUserId: input.actorUserId, action: input.action, entityType: input.entityType, entityId: input.entityId, metadata: input.metadata ? JSON.stringify(input.metadata) : undefined });
  return { success: true as const };
}

export async function listMarketplaceServices(tenantId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db
    .select({ service: services, business: { id: businesses.id, name: businesses.name, city: businesses.city, district: businesses.district, latitude: businesses.latitude, longitude: businesses.longitude } })
    .from(services)
    .innerJoin(businesses, and(eq(services.businessId, businesses.id), eq(services.tenantId, businesses.tenantId)))
    .where(tenantId ? and(eq(services.tenantId, tenantId), eq(services.status, "published"), eq(businesses.status, "published")) : and(eq(services.status, "published"), eq(businesses.status, "published")));
}

export async function listServiceCategories() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(serviceCategories).where(eq(serviceCategories.status, "active"));
}

export async function createServiceForTenant(input: { tenantId: number; businessId: number; providerId?: number; categoryId?: number; name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!(await getBusinessForTenant(input.tenantId, input.businessId))) throw new Error("Business does not belong to tenant");
  if (input.providerId && !(await getProviderForTenantBusiness(input.tenantId, input.providerId, input.businessId))) throw new Error("Provider does not belong to business");
  const result = await db.insert(services).values({ ...input, status: "draft" });
  return { serviceId: Number(result[0].insertId) };
}

export async function listSubscriptionPlans() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(subscriptionPlans).where(eq(subscriptionPlans.status, "active"));
}

export async function listSubscriptionsForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).orderBy(desc(subscriptions.createdAt));
}

export type SubscriptionLifecycleInput = {
  status: "trial" | "active" | "expired" | "cancelled";
  trialEndsAt?: Date | null;
  currentPeriodEndsAt?: Date | null;
};

export function deriveSubscriptionStatus(input: SubscriptionLifecycleInput, now = new Date()): SubscriptionLifecycleInput["status"] {
  if (input.status === "cancelled" || input.status === "expired") return input.status;
  const expiry = input.status === "trial" ? input.trialEndsAt : input.currentPeriodEndsAt;
  return expiry && expiry.getTime() <= now.getTime() ? "expired" : input.status;
}

export async function getLatestSubscriptionForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const rows = await db.select().from(subscriptions).where(eq(subscriptions.tenantId, tenantId)).orderBy(desc(subscriptions.createdAt)).limit(1);
  return rows[0] ?? null;
}

export async function refreshSubscriptionStatusForTenant(tenantId: number, now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await getLatestSubscriptionForTenant(tenantId);
  if (!current) return null;
  const nextStatus = deriveSubscriptionStatus(current, now);
  if (nextStatus !== current.status) {
    await db.update(subscriptions).set({ status: nextStatus }).where(and(eq(subscriptions.id, current.id), eq(subscriptions.tenantId, tenantId)));
  }
  return { ...current, status: nextStatus };
}

export async function activateSubscriptionForTenant(input: { tenantId: number; subscriptionId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const current = await getSubscriptionForTenant(input.tenantId, input.subscriptionId);
  if (!current) throw new Error("Subscription does not belong to tenant");
  const currentPeriodEndsAt = new Date(Date.now() + BILLING_PERIOD_DAYS * 86400000);
  await db.update(subscriptions).set({ status: "active", currentPeriodEndsAt }).where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.tenantId, input.tenantId)));
  return { success: true as const, currentPeriodEndsAt };
}

export async function cancelSubscriptionForTenant(input: { tenantId: number; subscriptionId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!(await getSubscriptionForTenant(input.tenantId, input.subscriptionId))) throw new Error("Subscription does not belong to tenant");
  await db.update(subscriptions).set({ status: "cancelled" }).where(and(eq(subscriptions.id, input.subscriptionId), eq(subscriptions.tenantId, input.tenantId)));
  return { success: true as const };
}

export async function createTrialSubscription(input: { tenantId: number; planId: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const plan = await getSubscriptionPlan(input.planId);
  if (!plan) throw new Error("Subscription plan is not active");
  const startedAt = new Date();
  const trialDays = getServerTrialDuration(plan.trialDays);
  const trialEndsAt = new Date(startedAt.getTime() + trialDays * 86400000);
  const result = await db.insert(subscriptions).values({ tenantId: input.tenantId, planId: input.planId, status: "trial", startedAt, trialEndsAt });
  return { subscriptionId: Number(result[0].insertId), trialEndsAt, trialDays };
}

export async function getServiceRequestForTenant(tenantId: number, requestId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(serviceRequests).where(and(eq(serviceRequests.id, requestId), eq(serviceRequests.tenantId, tenantId))).limit(1);
  return rows[0] ?? null;
}

export async function listRequestsForTenant(tenantId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db.select().from(serviceRequests).where(eq(serviceRequests.tenantId, tenantId)).orderBy(desc(serviceRequests.createdAt));
}

export async function createServiceRequestForTenant(input: { tenantId: number; customerId: number; serviceId: number; note?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  if (!(await getCustomerForTenant(input.tenantId, input.customerId))) throw new Error("Customer does not belong to tenant");
  if (!(await getServiceForTenant(input.tenantId, input.serviceId))) throw new Error("Service does not belong to tenant");
  const result = await db.insert(serviceRequests).values(input);
  return { requestId: Number(result[0].insertId) };
}

export async function getAdminDashboardSummary() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const [tenantRows, memberRows, businessRows, customerRows, providerRows, recentLogs] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(tenants),
    db.select({ count: sql<number>`count(*)` }).from(tenantMembers),
    db.select({ count: sql<number>`count(*)` }).from(businesses),
    db.select({ count: sql<number>`count(*)` }).from(customers),
    db.select({ count: sql<number>`count(*)` }).from(providerProfiles),
    db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(12),
  ]);
  return { counts: { tenants: Number(tenantRows[0]?.count ?? 0), members: Number(memberRows[0]?.count ?? 0), businesses: Number(businessRows[0]?.count ?? 0), customers: Number(customerRows[0]?.count ?? 0), providers: Number(providerRows[0]?.count ?? 0) }, recentLogs };
}

export async function createSubscriptionPlan(input: { code: string; name: string; description?: string; monthlyPrice: string; trialDays: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(subscriptionPlans).values({ ...input, status: "active" });
  return { planId: Number(result[0].insertId) };
}

export type SubscriptionPlanUpdate = { planId: number; name?: string; description?: string; monthlyPrice?: string; trialDays?: number; status?: "active" | "archived" };

export function toSubscriptionPlanChanges(input: SubscriptionPlanUpdate) {
  const { planId: _planId, ...changes } = input;
  return changes;
}

export async function applySubscriptionPlanUpdate(db: any, input: SubscriptionPlanUpdate) {
  await db.update(subscriptionPlans).set(toSubscriptionPlanChanges(input)).where(eq(subscriptionPlans.id, input.planId));
  return { success: true as const };
}

export async function updateSubscriptionPlan(input: SubscriptionPlanUpdate) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return applySubscriptionPlanUpdate(db, input);
}

export async function createServiceCategory(input: { name: string; slug: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.insert(serviceCategories).values({ ...input, status: "active" });
  return { categoryId: Number(result[0].insertId) };
}

export async function updateServiceCategory(input: { categoryId: number; name?: string; slug?: string; status?: "active" | "archived" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const { categoryId, ...changes } = input;
  await db.update(serviceCategories).set(changes).where(eq(serviceCategories.id, categoryId));
  return { success: true as const };
}

export const operationalCatalogSeed = {
  plans: [
    { code: "starter", name: "البداية", description: "مسار أولي لإدارة الحضور الرقمي", monthlyPrice: "0.00", trialDays: 14, status: "active" as const },
    { code: "growth", name: "النمو", description: "مسار موسع للمنشآت ومقدمي الخدمات", monthlyPrice: "0.00", trialDays: 30, status: "active" as const },
  ],
  categories: [
    { name: "الخدمات الرقمية", slug: "digital-services", status: "active" as const },
    { name: "السياحة والضيافة", slug: "tourism-hospitality", status: "active" as const },
    { name: "التجارة المحلية", slug: "local-commerce", status: "active" as const },
  ],
};

export function getMissingOperationalCatalog(existingPlanCodes: string[], existingCategorySlugs: string[]) {
  const planCodes = new Set(existingPlanCodes);
  const categorySlugs = new Set(existingCategorySlugs);
  return {
    plans: operationalCatalogSeed.plans.filter(plan => !planCodes.has(plan.code)),
    categories: operationalCatalogSeed.categories.filter(category => !categorySlugs.has(category.slug)),
  };
}

export async function bootstrapOperationalCatalog() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const existingPlans = await db.select({ code: subscriptionPlans.code }).from(subscriptionPlans);
  const existingCategories = await db.select({ slug: serviceCategories.slug }).from(serviceCategories);
  const missing = getMissingOperationalCatalog(existingPlans.map(row => row.code), existingCategories.map(row => row.slug));
  if (missing.plans.length) await db.insert(subscriptionPlans).values(missing.plans);
  if (missing.categories.length) await db.insert(serviceCategories).values(missing.categories);
  return { createdPlans: missing.plans.length, createdCategories: missing.categories.length };
}

export async function updateServiceRequestStatus(input: { tenantId: number; requestId: number; status: "new" | "in_progress" | "completed" | "cancelled" }) {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  const result = await db.update(serviceRequests).set({ status: input.status }).where(and(eq(serviceRequests.id, input.requestId), eq(serviceRequests.tenantId, input.tenantId)));
  return { success: true as const, requestId: input.requestId, status: input.status, affectedRows: Number(result[0].affectedRows ?? 0) };
}


export async function upsertDeviceToken(input: { userId: number; tenantId: number; token: string; platform: "android" | "ios" | "web" }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const existing = await db.select().from(deviceTokens).where(eq(deviceTokens.token, input.token)).limit(1);
  if (existing[0]) {
    await db.update(deviceTokens).set({ userId: input.userId, tenantId: input.tenantId, platform: input.platform, enabled: 1, lastSeenAt: new Date() }).where(eq(deviceTokens.id, existing[0].id));
    return { id: existing[0].id, updated: true };
  }
  const result = await db.insert(deviceTokens).values({ ...input, token: input.token.trim(), enabled: 1, lastSeenAt: new Date() });
  return { id: Number(result[0].insertId), updated: false };
}

export async function revokeDeviceToken(input: { userId: number; tenantId: number; token: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  await db.update(deviceTokens).set({ enabled: 0, lastSeenAt: new Date() }).where(and(eq(deviceTokens.userId, input.userId), eq(deviceTokens.tenantId, input.tenantId), eq(deviceTokens.token, input.token)));
  return { success: true };
}

export async function listWorkspacesForTenant(tenantId: number, userId: number) {
  const db = await getDb();
  if (!db) return [] as Array<{ workspace: Workspace }>;
  return db.select({ workspace: workspaces }).from(workspaces).innerJoin(workspaceMembers, eq(workspaceMembers.workspaceId, workspaces.id)).where(and(eq(workspaces.tenantId, tenantId), eq(workspaceMembers.userId, userId), eq(workspaces.status, "active")));
}

export async function createWorkspaceForTenant(input: { tenantId: number; ownerUserId: number; name: string; description?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(workspaces).values({ tenantId: input.tenantId, ownerUserId: input.ownerUserId, name: input.name.trim(), description: input.description?.trim() || null });
  const workspaceId = Number(result[0].insertId);
  await db.insert(workspaceMembers).values({ workspaceId, tenantId: input.tenantId, userId: input.ownerUserId, role: "owner" });
  return { workspaceId };
}

export async function inviteWorkspaceMember(input: { tenantId: number; workspaceId: number; userId: number; role: "editor" | "commenter" | "viewer" }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const workspace = await db.select({ id: workspaces.id, tenantId: workspaces.tenantId }).from(workspaces).where(and(eq(workspaces.id, input.workspaceId), eq(workspaces.tenantId, input.tenantId))).limit(1);
  if (!workspace[0]) throw new Error("Workspace not found");
  const existing = await db.select({ id: workspaceMembers.id }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, input.workspaceId), eq(workspaceMembers.userId, input.userId))).limit(1);
  if (existing[0]) {
    await db.update(workspaceMembers).set({ tenantId: input.tenantId, role: input.role, status: "invited" }).where(eq(workspaceMembers.id, existing[0].id));
    return { memberId: existing[0].id, updated: true };
  }
  const result = await db.insert(workspaceMembers).values({ workspaceId: input.workspaceId, tenantId: input.tenantId, userId: input.userId, role: input.role, status: "invited" });
  return { memberId: Number(result[0].insertId), updated: false };
}

export async function createWorkspaceTask(input: { tenantId: number; workspaceId: number; createdByUserId: number; title: string; description?: string; assigneeUserId?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");
  const result = await db.insert(workspaceTasks).values({ tenantId: input.tenantId, workspaceId: input.workspaceId, createdByUserId: input.createdByUserId, title: input.title.trim(), description: input.description?.trim() || null, assigneeUserId: input.assigneeUserId ?? null });
  return { taskId: Number(result[0].insertId) };
}

export async function listWorkspaceTasks(input: { tenantId: number; workspaceId: number }) {
  const db = await getDb();
  if (!db) return [] as WorkspaceTask[];
  return db.select().from(workspaceTasks).where(and(eq(workspaceTasks.tenantId, input.tenantId), eq(workspaceTasks.workspaceId, input.workspaceId))).orderBy(desc(workspaceTasks.createdAt));
}

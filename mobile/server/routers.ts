import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";
import { createHmac, randomBytes } from "node:crypto";
import { COOKIE_NAME } from "../shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { invokeLLM } from "./_core/llm";
import { transcribeAudio } from "./_core/voiceTranscription";
import { storagePut, storageGetSignedUrl } from "./storage";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { canReadTenantData, canWriteTenantData } from "./tenantAccess";
import {
  createBusinessForTenant,
  createCustomerForTenant,
  createProviderForTenant,
  createTenantWithOwner,
  deleteBusinessForTenant,
  deleteCustomerForTenant,
  deleteProviderForTenant,
  listBusinessesForTenant,
  createServiceForTenant,
  createServiceRequestForTenant,
  createTrialSubscription,
  refreshSubscriptionStatusForTenant,
  activateSubscriptionForTenant,
  cancelSubscriptionForTenant,
  getAdminDashboardSummary,
  getTenantMembership,
  getBusinessForTenant,
  getProviderForTenantBusiness,
  getServiceForTenant,
  getCustomerForTenant,
  getServiceRequestForTenant,
  getSubscriptionForTenant,
  getSubscriptionPlan,
  listMarketplaceServices,
  listRequestsForTenant,
  updateServiceRequestStatus,
  listServiceCategories,
  listSubscriptionPlans,
  listSubscriptionsForTenant,
  listCustomersForTenant,
  listProvidersForTenant,
  listTenantsForUser,
  updateBusinessForTenant,
  updateCustomerForTenant,
  updateProviderForTenant,
  writeAuditLog,
  createSubscriptionPlan,
  updateSubscriptionPlan,
  createServiceCategory,
  updateServiceCategory,
  bootstrapOperationalCatalog,
  listNotificationsForUser,
  markNotificationRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  createNotification,
  getUserProfile,
  upsertUserProfile,
  getPublicUserProfile,
  listWorkspacesForTenant,
  createWorkspaceForTenant,
  createWorkspaceTask,
  inviteWorkspaceMember,
  listWorkspaceTasks,
  upsertDeviceToken,
  revokeDeviceToken,
} from "./db";
import { assistantQuota, consumeAssistantQuota, publicAssistantKnowledge } from "./assistantSafety";
import { ENV } from "./_core/env";

const assistantMessage = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1200),
});

const siteContext = z.enum(["top", "audience", "how-it-works", "roles", "calculator", "local", "use-cases", "trust", "resources", "launch", "contact"]);

const ASSISTANT_COOKIE = "__Host-ai-digital-sinai-assistant";

function getAssistantSessionKey(ctx: TrpcContext) {
  const cookieHeader = typeof ctx.req.headers.cookie === "string" ? ctx.req.headers.cookie : "";
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${ASSISTANT_COOKIE}=([^;]+)`));
  if (match?.[1]) {
    const [raw, signature] = decodeURIComponent(match[1]).split(".");
    const expected = createHmac("sha256", ENV.cookieSecret).update(raw ?? "").digest("hex");
    if (raw && signature && signature === expected) return `cookie:${raw}`;
  }
  const raw = randomBytes(24).toString("hex");
  const signature = createHmac("sha256", ENV.cookieSecret).update(raw).digest("hex");
  if (typeof ctx.res.cookie === "function") {
    ctx.res.cookie(ASSISTANT_COOKIE, `${raw}.${signature}`, { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 86_400_000 });
  }
  return `cookie:${raw}`;
}

const tenantSlug = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must use lowercase letters, numbers, and hyphens");

function extractAssistantText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map(part => {
      if (typeof part === "string") return part;
      if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  profile: router({
    mine: protectedProcedure.query(({ ctx }) => getUserProfile(ctx.user.id)),
    publicByHandle: publicProcedure
      .input(z.object({ handle: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9-]+)*$/) }))
      .query(async ({ input }) => {
        const profile = await getPublicUserProfile(input.handle.toLowerCase());
        if (!profile) throw new TRPCError({ code: "NOT_FOUND", message: "الملف غير متاح للعامة" });
        return profile;
      }),
    update: protectedProcedure
      .input(z.object({
        handle: z.string().trim().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9-]+)*$/, "استخدم حروفاً إنجليزية صغيرة وأرقاماً وشرطات فقط"),
        displayName: z.string().trim().min(2).max(160),
        bio: z.string().trim().max(1000).nullable().optional(),
        avatarUrl: z.string().url().max(500).nullable().optional(),
        city: z.string().trim().max(120).nullable().optional(),
        websiteUrl: z.string().url().max(500).nullable().optional(),
        coverUrl: z.string().url().max(500).nullable().optional(),
        accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#39c6b5"),
        showBio: z.boolean().default(true),
        showCity: z.boolean().default(true),
        showWebsite: z.boolean().default(true),
        visibility: z.enum(["private", "public"]),
      }))
      .mutation(({ ctx, input }) => upsertUserProfile({ ...input, userId: ctx.user.id, handle: input.handle.toLowerCase(), showBio: input.showBio ? 1 : 0, showCity: input.showCity ? 1 : 0, showWebsite: input.showWebsite ? 1 : 0 })),
  }),
  tenant: router({
    list: protectedProcedure.query(({ ctx }) => listTenantsForUser(ctx.user.id)),
    create: protectedProcedure
      .input(
        z.object({
          name: z.string().trim().min(2).max(160),
          slug: tenantSlug,
        }),
      )
      .mutation(async ({ ctx, input }) => {
        const result = await createTenantWithOwner({ name: input.name, slug: input.slug.toLowerCase(), ownerUserId: ctx.user.id });
        await writeAuditLog({ tenantId: result.tenantId, actorUserId: ctx.user.id, action: "tenant.created", entityType: "tenant", entityId: result.tenantId });
        return result;
      }),
    membership: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive() }))
      .query(({ ctx, input }) => getTenantMembership(ctx.user.id, input.tenantId)),
  }),
  notifications: router({
    list: protectedProcedure.input(z.object({ tenantId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      const items = await listNotificationsForUser({ tenantId: input.tenantId, userId: ctx.user.id });
      return { items, unreadCount: items.filter(item => !item.readAt).length };
    }),
    preferences: protectedProcedure.input(z.object({ tenantId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      return getNotificationPreferences({ tenantId: input.tenantId, userId: ctx.user.id });
    }),
    updatePreferences: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), marketplaceRequests: z.boolean(), subscriptionUpdates: z.boolean() })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      return updateNotificationPreferences({ ...input, userId: ctx.user.id });
    }),
    markRead: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), notificationId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      return markNotificationRead({ ...input, userId: ctx.user.id });
    }),
  }),
  customer: router({
    list: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        return listCustomersForTenant(input.tenantId);
      }),
    create: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive(), name: z.string().trim().min(2).max(180), email: z.string().email().max(320).optional(), phone: z.string().trim().max(40).optional() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        const result = await createCustomerForTenant({ ...input });
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "customer.created", entityType: "customer", entityId: result.customerId });
        return result;
      }),
    update: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive(), customerId: z.number().int().positive(), name: z.string().trim().min(2).max(180).optional(), email: z.string().email().max(320).optional(), phone: z.string().trim().max(40).optional(), status: z.enum(["active", "inactive", "blocked"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        const result = await updateCustomerForTenant(input);
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "customer.updated", entityType: "customer", entityId: input.customerId });
        return result;
      }),
    delete: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive(), customerId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        const result = await deleteCustomerForTenant(input);
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "customer.deleted", entityType: "customer", entityId: input.customerId });
        return result;
      }),
  }),
  business: router({
    list: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        return listBusinessesForTenant(input.tenantId);
      }),
    create: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive(), name: z.string().trim().min(2).max(180), slug: tenantSlug, description: z.string().max(5000).optional(), city: z.string().max(120).optional(), district: z.string().max(120).optional(), latitude: z.string().regex(/^-?([0-8]?\d(?:\.\d+)?|90(?:\.0+)?)$/).optional(), longitude: z.string().regex(/^-?(?:180(?:\.0+)?|(?:1[0-7]\d|[1-9]?\d)(?:\.\d+)?)$/).optional() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        const result = await createBusinessForTenant({ ...input, ownerUserId: ctx.user.id });
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "business.created", entityType: "business", entityId: result.businessId });
        return result;
      }),
    update: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive(), businessId: z.number().int().positive(), name: z.string().trim().min(2).max(180).optional(), description: z.string().max(5000).optional(), city: z.string().max(120).optional(), district: z.string().max(120).optional(), status: z.enum(["draft", "pending_review", "published", "suspended"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        const result = await updateBusinessForTenant(input);
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "business.updated", entityType: "business", entityId: input.businessId });
        return result;
      }),
    delete: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive(), businessId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        const result = await deleteBusinessForTenant(input);
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "business.deleted", entityType: "business", entityId: input.businessId });
        return result;
      }),
  }),
  provider: router({
    list: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        return listProvidersForTenant(input.tenantId);
      }),
    create: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive(), businessId: z.number().int().positive(), displayName: z.string().trim().min(2).max(160), bio: z.string().max(5000).optional() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        if (!(await getBusinessForTenant(input.tenantId, input.businessId))) throw new TRPCError({ code: "FORBIDDEN" });
        const result = await createProviderForTenant({ ...input, userId: ctx.user.id });
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "provider.created", entityType: "provider_profile", entityId: result.providerId });
        return result;
      }),
    update: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive(), providerId: z.number().int().positive(), displayName: z.string().trim().min(2).max(160).optional(), bio: z.string().max(5000).optional(), status: z.enum(["active", "pending", "suspended"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        const result = await updateProviderForTenant(input);
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "provider.updated", entityType: "provider_profile", entityId: input.providerId });
        return result;
      }),
    delete: protectedProcedure
      .input(z.object({ tenantId: z.number().int().positive(), providerId: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        const membership = await getTenantMembership(ctx.user.id, input.tenantId);
        if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
        const result = await deleteProviderForTenant(input);
        await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "provider.deleted", entityType: "provider_profile", entityId: input.providerId });
        return result;
      }),
  }),
  marketplace: router({
    categories: publicProcedure.query(() => listServiceCategories()),
    discover: publicProcedure.input(z.object({ tenantId: z.number().int().positive().optional() }).optional()).query(({ input }) => listMarketplaceServices(input?.tenantId)),
    createService: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), businessId: z.number().int().positive(), providerId: z.number().int().positive().optional(), categoryId: z.number().int().positive().optional(), name: z.string().trim().min(2).max(180), description: z.string().max(5000).optional() })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      if (!(await getBusinessForTenant(input.tenantId, input.businessId))) throw new TRPCError({ code: "FORBIDDEN" });
      if (input.providerId && !(await getProviderForTenantBusiness(input.tenantId, input.providerId, input.businessId))) throw new TRPCError({ code: "FORBIDDEN" });
      const result = await createServiceForTenant(input);
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "service.created", entityType: "service", entityId: result.serviceId });
      return result;
    }),
  }),
  subscription: router({
    plans: publicProcedure.query(() => listSubscriptionPlans()),
    list: protectedProcedure.input(z.object({ tenantId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      return listSubscriptionsForTenant(input.tenantId);
    }),
    startTrial: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), planId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      if (!(await getSubscriptionPlan(input.planId))) throw new TRPCError({ code: "BAD_REQUEST", message: "الخطة غير متاحة." });
       const result = await createTrialSubscription(input);
       await createNotification({ tenantId: input.tenantId, userId: ctx.user.id, type: "subscription_update", title: "بدأت التجربة", body: `تم بدء تجربة الخطة لمدة ${result.trialDays} يوماً.` });
       await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "subscription.trial_started", entityType: "subscription", entityId: result.subscriptionId });
       return result;
    }),
    refresh: protectedProcedure.input(z.object({ tenantId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      return refreshSubscriptionStatusForTenant(input.tenantId);
    }),
    activate: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), subscriptionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      if (!(await getSubscriptionForTenant(input.tenantId, input.subscriptionId))) throw new TRPCError({ code: "FORBIDDEN" });
       const result = await activateSubscriptionForTenant(input);
       await createNotification({ tenantId: input.tenantId, userId: ctx.user.id, type: "subscription_update", title: "تم تفعيل الاشتراك", body: "تم تفعيل دورة الاشتراك الحالية بنجاح." });
       await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "subscription.activated", entityType: "subscription", entityId: input.subscriptionId });
       return result;
    }),
    cancel: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), subscriptionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      if (!(await getSubscriptionForTenant(input.tenantId, input.subscriptionId))) throw new TRPCError({ code: "FORBIDDEN" });
       const result = await cancelSubscriptionForTenant(input);
       await createNotification({ tenantId: input.tenantId, userId: ctx.user.id, type: "subscription_update", title: "تم إلغاء الاشتراك", body: "تم تسجيل إلغاء الاشتراك ويمكنك إعادة التفعيل من صفحة الاشتراكات." });
       await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "subscription.cancelled", entityType: "subscription", entityId: input.subscriptionId });
       return result;
    }),
  }),
  request: router({
    list: protectedProcedure.input(z.object({ tenantId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      return listRequestsForTenant(input.tenantId);
    }),
    create: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), customerId: z.number().int().positive(), serviceId: z.number().int().positive(), note: z.string().max(3000).optional() })).mutation(async ({ ctx, input }) => {
       const membership = await getTenantMembership(ctx.user.id, input.tenantId);
       if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
       const customer = await getCustomerForTenant(input.tenantId, input.customerId);
       const service = await getServiceForTenant(input.tenantId, input.serviceId);
       if (!customer || !service) throw new TRPCError({ code: "FORBIDDEN" });
       const result = await createServiceRequestForTenant(input);
       await createNotification({ tenantId: input.tenantId, userId: ctx.user.id, type: "marketplace_request", title: "تم إنشاء طلب سوق", body: "تم تسجيل طلب الخدمة وسيظهر في دورة المتابعة." });
       await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "request.created", entityType: "service_request", entityId: result.requestId });
       return result;
    }),
    updateStatus: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), requestId: z.number().int().positive(), status: z.enum(["new", "in_progress", "completed", "cancelled"]) })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      if (!(await getServiceRequestForTenant(input.tenantId, input.requestId))) throw new TRPCError({ code: "FORBIDDEN" });
      const result = await updateServiceRequestStatus(input);
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: `request.status.${input.status}`, entityType: "service_request", entityId: input.requestId });
      return result;
    }),
  }),
  workspaces: router({
    list: protectedProcedure.input(z.object({ tenantId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      return listWorkspacesForTenant(input.tenantId, ctx.user.id);
    }),
    create: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), name: z.string().trim().min(2).max(120), description: z.string().trim().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      const result = await createWorkspaceForTenant({ ...input, ownerUserId: ctx.user.id });
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "workspace.created", entityType: "workspace", entityId: result.workspaceId });
      return result;
    }),
    tasks: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), workspaceId: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      const workspaces = await listWorkspacesForTenant(input.tenantId, ctx.user.id);
      if (!workspaces.some(row => row.workspace.id === input.workspaceId)) throw new TRPCError({ code: "FORBIDDEN" });
      return listWorkspaceTasks(input);
    }),
    createTask: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), workspaceId: z.number().int().positive(), title: z.string().trim().min(2).max(180), description: z.string().trim().max(2000).optional(), assigneeUserId: z.number().int().positive().optional() })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      const workspaces = await listWorkspacesForTenant(input.tenantId, ctx.user.id);
      if (!workspaces.some(row => row.workspace.id === input.workspaceId)) throw new TRPCError({ code: "FORBIDDEN" });
      const result = await createWorkspaceTask({ ...input, createdByUserId: ctx.user.id });
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "workspace.task.created", entityType: "workspace_task", entityId: result.taskId });
      return result;
    }),
    inviteMember: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), workspaceId: z.number().int().positive(), userId: z.number().int().positive(), role: z.enum(["editor", "commenter", "viewer"]) })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canWriteTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      const workspaces = await listWorkspacesForTenant(input.tenantId, ctx.user.id);
      if (!workspaces.some(row => row.workspace.id === input.workspaceId)) throw new TRPCError({ code: "FORBIDDEN" });
      const result = await inviteWorkspaceMember(input);
      await writeAuditLog({ tenantId: input.tenantId, actorUserId: ctx.user.id, action: "workspace.member.invited", entityType: "workspace_member", entityId: result.memberId });
      return result;
    }),
    registerDevice: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), token: z.string().trim().min(20).max(4096), platform: z.enum(["android", "ios", "web"]) })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      return upsertDeviceToken({ ...input, userId: ctx.user.id });
    }),
    revokeDevice: protectedProcedure.input(z.object({ tenantId: z.number().int().positive(), token: z.string().trim().min(20).max(4096) })).mutation(async ({ ctx, input }) => {
      const membership = await getTenantMembership(ctx.user.id, input.tenantId);
      if (!canReadTenantData(membership)) throw new TRPCError({ code: "FORBIDDEN" });
      return revokeDeviceToken({ ...input, userId: ctx.user.id });
    }),
  }),
  admin: router({
    dashboard: protectedProcedure.query(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      return { access: "granted" as const, scope: "system" as const, ...(await getAdminDashboardSummary()) };
    }),
    createPlan: protectedProcedure.input(z.object({ code: z.string().trim().min(2).max(40).regex(/^[a-z0-9-]+$/), name: z.string().trim().min(2).max(120), description: z.string().max(1000).optional(), monthlyPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/), trialDays: z.number().int().min(0).max(90) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const result = await createSubscriptionPlan(input);
      await writeAuditLog({ actorUserId: ctx.user.id, action: "plan.created", entityType: "subscription_plan", entityId: result.planId });
      return result;
    }),
    updatePlan: protectedProcedure.input(z.object({ planId: z.number().int().positive(), name: z.string().trim().min(2).max(120).optional(), description: z.string().max(1000).optional(), monthlyPrice: z.string().regex(/^\d+(?:\.\d{1,2})?$/).optional(), trialDays: z.number().int().min(0).max(90).optional(), status: z.enum(["active", "archived"]).optional() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const result = await updateSubscriptionPlan(input);
      await writeAuditLog({ actorUserId: ctx.user.id, action: "plan.updated", entityType: "subscription_plan", entityId: input.planId });
      return result;
    }),
    createCategory: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(120), slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/) })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const result = await createServiceCategory(input);
      await writeAuditLog({ actorUserId: ctx.user.id, action: "category.created", entityType: "service_category", entityId: result.categoryId });
      return result;
    }),
    updateCategory: protectedProcedure.input(z.object({ categoryId: z.number().int().positive(), name: z.string().trim().min(2).max(120).optional(), slug: z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/).optional(), status: z.enum(["active", "archived"]).optional() })).mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const result = await updateServiceCategory(input);
      await writeAuditLog({ actorUserId: ctx.user.id, action: "category.updated", entityType: "service_category", entityId: input.categoryId });
      return result;
    }),
    bootstrapCatalog: protectedProcedure.mutation(async ({ ctx }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const result = await bootstrapOperationalCatalog();
      await writeAuditLog({ actorUserId: ctx.user.id, action: "catalog.bootstrapped", entityType: "operational_catalog" });
      return result;
    }),
  }),
  assistant: router({
    voiceTranscribe: publicProcedure
      .input(z.object({
        base64: z.string().min(1).max(22_000_000),
        mimeType: z.enum(["audio/webm", "audio/webm;codecs=opus", "audio/mp4", "audio/mpeg", "audio/ogg", "audio/wav"]),
        size: z.number().int().positive().max(16 * 1024 * 1024),
      }))
      .mutation(async ({ input }) => {
        const audio = Buffer.from(input.base64, "base64");
        if (audio.length !== input.size || audio.length > 16 * 1024 * 1024) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "حجم التسجيل غير صالح أو يتجاوز 16 ميجابايت." });
        }
        const contentType = input.mimeType.split(";")[0] ?? input.mimeType;
        const extension = contentType === "audio/mp4" ? "m4a" : contentType.split("/")[1] ?? "webm";
        const uploaded = await storagePut(`assistant-voice/recording.${extension}`, audio, contentType);
        const signedUrl = await storageGetSignedUrl(uploaded.key);
        const result = await transcribeAudio({ audioUrl: signedUrl, language: "ar", prompt: "حوّل كلام المستخدم العربي إلى نص عربي واضح دون إضافة أو اختلاق." });
        if ("error" in result) throw new TRPCError({ code: "BAD_REQUEST", message: result.error, cause: result });
        return { text: result.text, language: result.language };
      }),
    chat: publicProcedure
      .input(z.object({
        messages: z.array(assistantMessage).min(1).max(12),
        pageContext: siteContext.default("top"),
        sessionKey: z.string().trim().min(8).max(180).optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const sessionKey = getAssistantSessionKey(ctx);
        const quota = consumeAssistantQuota(sessionKey);
        if (!quota.allowed) {
          throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: `تم الوصول إلى حد الرسائل المؤقت. حاول بعد ${Math.ceil(assistantQuota.windowMs / 60000)} دقيقة.` });
        }
        const contextLabels: Record<z.infer<typeof siteContext>, string> = {
          top: "المقدمة والرسالة العامة",
          audience: "اختيار مسار العميل أو التاجر أو الإدارة",
          "how-it-works": "شرح كيف تعمل المنصة",
          roles: "مسارات الاستخدام",
          calculator: "حاسبة التاجر التقديرية",
          local: "الرؤية المحلية ونقطة البداية من سيناء",
          "use-cases": "حالات الاستخدام",
          trust: "الثقة والشفافية",
          resources: "مركز الموارد",
          launch: "قائمة الإطلاق",
          contact: "التواصل مع الفريق",
        };
        const response = await invokeLLM({
          messages: [
            {
              role: "system",
              content: `أنت «رفيق الإشارة»، مساعد عربي ودود لموقع AI DIGITAL SINAI. أجب بالعربية الواضحة والمختصرة، وبنبرة مهنية إنسانية. ساعد الزائر على فهم المنصة واختيار مسار العميل أو التاجر أو الإدارة. لا تخترع أسعاراً أو أرقام نجاح أو شهادات عملاء أو شركاء. إذا لم تعرف، صرّح بذلك واقترح التواصل مع الفريق. السياق الحالي للزائر: ${contextLabels[input.pageContext]}. ${publicAssistantKnowledge} لا تطلب كلمات مرور أو بيانات دفع أو بيانات حساسة. اجعل الإجابة في 2-4 فقرات قصيرة أو نقاط قليلة، واقترح خطوة تالية مرتبطة بالقسم الحالي عند الحاجة.`,
            },
            ...input.messages.slice(-10).map(message => ({ role: message.role, content: message.content })),
          ],
          maxTokens: 500,
        });
        const content = response.choices[0]?.message?.content;
        const text = extractAssistantText(content) || "أعتذر، لم أستطع صياغة إجابة الآن. جرّب مرة أخرى أو اترك بياناتك لفريقنا.";
        return { text };
      }),
  }),
});

export type AppRouter = typeof appRouter;

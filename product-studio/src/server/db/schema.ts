import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const id = () => text("id").primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

// ── Identity ─────────────────────────────────────────────────────────────

export const users = pgTable(
  "users",
  {
    id: id(),
    email: text("email").notNull(),
    name: text("name").notNull(),
    passwordHash: text("password_hash").notNull(),
    defaultWorkspaceId: text("default_workspace_id"),
    preferences: jsonb("preferences").$type<UserPreferences>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("users_email_idx").on(t.email)],
);

export interface UserPreferences {
  defaultLanguage?: "en" | "ar";
  defaultTone?: string;
  emailUpdates?: boolean;
}

export const sessions = pgTable(
  "sessions",
  {
    /** SHA-256 of the session token; the raw token only lives in the cookie. */
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    workspaceId: text("workspace_id"),
    userAgent: text("user_agent"),
    ip: text("ip"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResets = pgTable("password_resets", {
  id: id(), // SHA-256 of token
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

// ── Workspaces, teams & billing ──────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: id(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(),
  plan: text("plan").notNull().default("free"),
  billingInterval: text("billing_interval"),
  subscriptionStatus: text("subscription_status"),
  cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  /** Monthly allowance remaining in the current period. */
  planCredits: integer("plan_credits").notNull().default(0),
  /** Purchased top-up credits; never expire. */
  bonusCredits: integer("bonus_credits").notNull().default(0),
  creditsResetAt: timestamp("credits_reset_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"), // owner | admin | member
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), index("memberships_user_idx").on(t.userId)],
);

export const invites = pgTable(
  "invites",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").notNull().default("member"),
    tokenHash: text("token_hash").notNull(),
    invitedBy: text("invited_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("invites_token_idx").on(t.tokenHash), index("invites_ws_idx").on(t.workspaceId)],
);

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: text("user_id"),
    /** Positive = credits added, negative = spent. */
    delta: integer("delta").notNull(),
    bucket: text("bucket").notNull(), // plan | bonus
    reason: text("reason").notNull(), // generation | refund | monthly_grant | purchase | plan_change | adjustment
    generationId: text("generation_id"),
    note: text("note"),
    balanceAfter: integer("balance_after").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("ledger_ws_idx").on(t.workspaceId, t.createdAt), index("ledger_gen_idx").on(t.generationId)],
);

export const billingEvents = pgTable("billing_events", {
  /** Stripe event id — makes webhook processing idempotent. */
  id: id(),
  type: text("type").notNull(),
  workspaceId: text("workspace_id"),
  data: jsonb("data"),
  createdAt: createdAt(),
});

// ── Content ──────────────────────────────────────────────────────────────

export const folders = pgTable(
  "folders",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("folders_ws_idx").on(t.workspaceId)],
);

export interface ProductInfo {
  name?: string;
  brand?: string;
  category?: string;
  price?: string;
  currency?: string;
  /** Free-form facts supplied by the seller (materials, sizes, ingredients...). */
  facts?: string;
  audience?: string;
  keywords?: string;
}

export interface ProductAnalysis {
  productName: string;
  category: string;
  visibleBrandText: string[];
  colors: { name: string; hex: string }[];
  materials: string[];
  shape: string;
  suggestedLayout: "standing" | "floating" | "flatlay";
  suggestedStyles: string[];
  visibleAttributes: string[];
  photoIssues: string[];
  confidence: "low" | "medium" | "high";
}

export const projects = pgTable(
  "projects",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    createdBy: text("created_by").notNull(),
    name: text("name").notNull(),
    folderId: text("folder_id"),
    favorite: boolean("favorite").notNull().default(false),
    product: jsonb("product").$type<ProductInfo>().notNull().default({}),
    analysis: jsonb("analysis").$type<ProductAnalysis | null>(),
    originalAssetId: text("original_asset_id"),
    cutoutAssetId: text("cutout_asset_id"),
    coverAssetId: text("cover_asset_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_ws_idx").on(t.workspaceId, t.updatedAt)],
);

export type AssetKind =
  | "original"
  | "cutout"
  | "render"
  | "scene"
  | "enhanced"
  | "upscaled"
  | "angle"
  | "mockup"
  | "bundle"
  | "ad"
  | "social"
  | "logo";

export const assets = pgTable(
  "assets",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    createdBy: text("created_by"),
    kind: text("kind").$type<AssetKind>().notNull(),
    label: text("label"),
    storageKey: text("storage_key").notNull(),
    mime: text("mime").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    parentId: text("parent_id"),
    generationId: text("generation_id"),
    folderId: text("folder_id"),
    favorite: boolean("favorite").notNull().default(false),
    meta: jsonb("meta").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index("assets_ws_idx").on(t.workspaceId, t.createdAt),
    index("assets_project_idx").on(t.projectId),
    index("assets_gen_idx").on(t.generationId),
  ],
);

export type GenerationStatus = "queued" | "running" | "succeeded" | "failed" | "canceled";

export const generations = pgTable(
  "generations",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    userId: text("user_id").notNull(),
    parentId: text("parent_id"),
    type: text("type").notNull(),
    status: text("status").$type<GenerationStatus>().notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    stage: text("stage"),
    params: jsonb("params").$type<Record<string, unknown>>().notNull().default({}),
    result: jsonb("result").$type<Record<string, unknown> | null>(),
    error: text("error"),
    creditsCharged: integer("credits_charged").notNull().default(0),
    refunded: boolean("refunded").notNull().default(false),
    provider: text("provider"),
    /** Process that owns the job; with heartbeatAt lets stale jobs be recovered across instances. */
    workerId: text("worker_id"),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    createdAt: createdAt(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("generations_ws_idx").on(t.workspaceId, t.createdAt),
    index("generations_project_idx").on(t.projectId),
    index("generations_status_idx").on(t.status),
  ],
);

export type CopyKind = "description" | "social" | "ad_copy" | "campaign" | "brand_kit";

/** Text content produced by the copy tools (descriptions, captions, campaigns...). */
export const copies = pgTable(
  "copies",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    generationId: text("generation_id"),
    createdBy: text("created_by"),
    kind: text("kind").$type<CopyKind>().notNull(),
    language: text("language").notNull().default("en"),
    tone: text("tone"),
    title: text("title").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    favorite: boolean("favorite").notNull().default(false),
    folderId: text("folder_id"),
    createdAt: createdAt(),
  },
  (t) => [index("copies_ws_idx").on(t.workspaceId, t.createdAt), index("copies_project_idx").on(t.projectId)],
);

/** Ad designer / social creator documents. */
export const designs = pgTable(
  "designs",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    projectId: text("project_id"),
    createdBy: text("created_by"),
    name: text("name").notNull(),
    formatId: text("format_id").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    doc: jsonb("doc").$type<Record<string, unknown>>().notNull(),
    thumbnailAssetId: text("thumbnail_asset_id"),
    favorite: boolean("favorite").notNull().default(false),
    folderId: text("folder_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("designs_ws_idx").on(t.workspaceId, t.updatedAt)],
);

export const brandKits = pgTable(
  "brand_kits",
  {
    id: id(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    logoAssetId: text("logo_asset_id"),
    createdBy: text("created_by"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("brand_kits_ws_idx").on(t.workspaceId)],
);

export type User = typeof users.$inferSelect;
export type Workspace = typeof workspaces.$inferSelect;
export type Project = typeof projects.$inferSelect;
export type Asset = typeof assets.$inferSelect;
export type Generation = typeof generations.$inferSelect;
export type Copy = typeof copies.$inferSelect;
export type Design = typeof designs.$inferSelect;
export type BrandKit = typeof brandKits.$inferSelect;
export type Membership = typeof memberships.$inferSelect;

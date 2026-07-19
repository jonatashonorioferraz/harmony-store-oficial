import { sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    role: text("role", { enum: ["admin", "collaborator"] }).notNull(),
    name: text("name").notNull(),
    login: text("login").notNull(),
    passwordHash: text("password_hash"),
    harmonyId: text("harmony_id").notNull(),
    cpfHash: text("cpf_hash"),
    cpfEncrypted: text("cpf_encrypted"),
    cpfLast4: text("cpf_last4"),
    email: text("email"),
    phone: text("phone"),
    address: text("address"),
    registration: text("registration"),
    sector: text("sector"),
    status: text("status", { enum: ["active", "inactive"] })
      .notNull()
      .default("active"),
    isPrimaryAdmin: integer("is_primary_admin", { mode: "boolean" })
      .notNull()
      .default(false),
    forcePasswordChange: integer("force_password_change", { mode: "boolean" })
      .notNull()
      .default(true),
    lastLoginAt: text("last_login_at"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("users_login_unique").on(table.login),
    uniqueIndex("users_harmony_id_unique").on(table.harmonyId),
    uniqueIndex("users_cpf_hash_unique").on(table.cpfHash),
    index("users_role_status_idx").on(table.role, table.status),
  ],
);

export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: text("expires_at").notNull(),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    index("sessions_user_idx").on(table.userId),
  ],
);

export const categories = sqliteTable(
  "categories",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [uniqueIndex("categories_name_unique").on(table.name)],
);

export const products = sqliteTable(
  "products",
  {
    id: text("id").primaryKey(),
    code: text("code"),
    name: text("name").notNull(),
    categoryId: text("category_id").references(() => categories.id, {
      onDelete: "set null",
    }),
    unit: text("unit", {
      enum: ["unit", "kg", "cm", "meter", "roll", "bottle", "box"],
    }).notNull(),
    physicalQuantity: real("physical_quantity").notNull().default(0),
    reservedQuantity: real("reserved_quantity").notNull().default(0),
    minimumQuantity: real("minimum_quantity").notNull().default(0),
    colorName: text("color_name"),
    colorHex: text("color_hex"),
    description: text("description"),
    imageKey: text("image_key"),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("products_code_unique").on(table.code),
    index("products_category_active_idx").on(table.categoryId, table.active),
  ],
);

export const customFieldDefinitions = sqliteTable(
  "custom_field_definitions",
  {
    id: text("id").primaryKey(),
    entityType: text("entity_type", {
      enum: ["product", "collaborator", "admin"],
    }).notNull(),
    fieldKey: text("field_key").notNull(),
    label: text("label").notNull(),
    fieldType: text("field_type", {
      enum: ["text", "number", "date", "select", "textarea"],
    }).notNull(),
    required: integer("required", { mode: "boolean" })
      .notNull()
      .default(false),
    optionsJson: text("options_json"),
    sortOrder: integer("sort_order").notNull().default(0),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("custom_fields_entity_key_unique").on(
      table.entityType,
      table.fieldKey,
    ),
  ],
);

export const customFieldValues = sqliteTable(
  "custom_field_values",
  {
    id: text("id").primaryKey(),
    definitionId: text("definition_id")
      .notNull()
      .references(() => customFieldDefinitions.id, { onDelete: "cascade" }),
    entityId: text("entity_id").notNull(),
    value: text("value"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("custom_values_definition_entity_unique").on(
      table.definitionId,
      table.entityId,
    ),
    index("custom_values_entity_idx").on(table.entityId),
  ],
);

export const requests = sqliteTable(
  "requests",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    collaboratorId: text("collaborator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: [
        "draft",
        "submitted",
        "separating",
        "partially_approved",
        "approved",
        "scheduled",
        "out_for_delivery",
        "ready_for_pickup",
        "delivered",
        "collected",
        "rejected",
        "cancelled",
      ],
    })
      .notNull()
      .default("submitted"),
    fulfillmentMethod: text("fulfillment_method", {
      enum: ["delivery", "pickup"],
    }),
    scheduledAt: text("scheduled_at"),
    purpose: text("purpose"),
    adminNote: text("admin_note"),
    approvedById: text("approved_by_id").references(() => users.id),
    deliveredBy: text("delivered_by"),
    receivedBy: text("received_by"),
    completedAt: text("completed_at"),
    cancelledAt: text("cancelled_at"),
    cancellationReason: text("cancellation_reason"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("requests_code_unique").on(table.code),
    index("requests_collaborator_status_idx").on(
      table.collaboratorId,
      table.status,
    ),
    index("requests_scheduled_idx").on(table.scheduledAt),
  ],
);

export const requestItems = sqliteTable(
  "request_items",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    requestedQuantity: real("requested_quantity").notNull(),
    approvedQuantity: real("approved_quantity"),
    status: text("status", {
      enum: ["requested", "approved", "adjusted", "removed"],
    })
      .notNull()
      .default("requested"),
    adjustmentReason: text("adjustment_reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("request_items_request_product_unique").on(
      table.requestId,
      table.productId,
    ),
    index("request_items_product_idx").on(table.productId),
  ],
);

export const stockMovements = sqliteTable(
  "stock_movements",
  {
    id: text("id").primaryKey(),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    requestId: text("request_id").references(() => requests.id, {
      onDelete: "set null",
    }),
    actorId: text("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    movementType: text("movement_type", {
      enum: ["entry", "reservation", "release", "delivery", "adjustment"],
    }).notNull(),
    quantity: real("quantity").notNull(),
    reason: text("reason"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("stock_movements_product_created_idx").on(
      table.productId,
      table.createdAt,
    ),
    index("stock_movements_request_idx").on(table.requestId),
  ],
);

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").primaryKey(),
    actorId: text("actor_id").references(() => users.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    ipHash: text("ip_hash"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    index("audit_logs_entity_idx").on(table.entityType, table.entityId),
    index("audit_logs_actor_created_idx").on(table.actorId, table.createdAt),
  ],
);

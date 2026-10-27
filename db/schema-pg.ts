import { pgTable, text, timestamp, boolean, integer, index, uniqueIndex } from 'void/schema-pg';

/**
 * Better Auth core tables for the PostgreSQL adapter. Same field naming as the
 * D1 schema so application queries are dialect-agnostic (all timestamps are
 * ISO strings in responses; `withTimezone: false` keeps both dialects on UTC
 * wall-clock values).
 */
export const user = pgTable('app_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
});

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: false }).notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: false }),
  refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: false }),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
});

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: false }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
});

export const studioPages = pgTable('studio_page', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  page: text('page').notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
});

export const studioPageShare = pgTable('studio_page_share', {
  pageId: text('page_id').primaryKey().references(() => studioPages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  snapshot: text('snapshot').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: false }).notNull().defaultNow(),
  activeVersion: integer('active_version').notNull().default(0),
});

export const studioPageVersions = pgTable('studio_page_version', {
  id: text('id').primaryKey(),
  pageId: text('page_id').notNull().references(() => studioPages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: text('snapshot').notNull(),
  sourceVersion: integer('source_version'),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
}, table => [
  uniqueIndex('studio_page_version_page_version_idx').on(table.pageId, table.version),
  index('studio_page_version_user_page_idx').on(table.userId, table.pageId, table.version),
]);

export const userPreferences = pgTable('user_preference', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  studioTheme: text('studio_theme').notNull().default('light'),
  inspectorDisclosures: text('inspector_disclosures').notNull().default('{}'),
  updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
});

/** Owner-scoped library organization; the folder migration adds the owner-locking limit trigger. */
export const studioComponentFolders = pgTable('studio_component_folder', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
}, table => [uniqueIndex('studio_component_folder_user_name_idx').on(table.userId, table.name)]);

/** Custom components saved to an account (see db/schema.ts). */
export const studioComponents = pgTable('studio_component', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => studioComponentFolders.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  definition: text('definition').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
}, table => [index('studio_component_user_updated_idx').on(table.userId, table.updatedAt)]);

export const studioComponentShare = pgTable('studio_component_share', {
  componentId: text('component_id').primaryKey().references(() => studioComponents.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  snapshot: text('snapshot').notNull(),
  revision: integer('revision').notNull(),
  publishedAt: timestamp('published_at', { withTimezone: false }).notNull().defaultNow(),
});

export const studioDataCredentials = pgTable('studio_data_credential', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  allowedHosts: text('allowed_hosts').notNull(),
  encryptedSecret: text('encrypted_secret').notNull(),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: false }).notNull().defaultNow(),
}, table => [index('studio_data_credential_user_idx').on(table.userId)]);

export const studioMedia = pgTable('studio_media', {
  id: text('id').primaryKey(),
  pageId: text('page_id').notNull().references(() => studioPages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  hash: text('hash').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: false }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: false }),
}, table => [index('studio_media_owner_page_idx').on(table.userId, table.pageId, table.createdAt)]);

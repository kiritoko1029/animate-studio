import { sqliteTable, text, integer, index, uniqueIndex } from 'void/schema-d1';

/**
 * Better Auth core tables for Cloudflare D1 (SQLite dialect). Field names use
 * Better Auth's defaults so `better-auth/adapters/drizzle` maps them without
 * extra options. Dates are stored as ISO-8601 text and booleans as 0/1, which
 * is what the SQLite adapter expects.
 */
export const user = sqliteTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const session = sqliteTable('session', {
  id: text('id').primaryKey(),
  expiresAt: text('expires_at').notNull(),
  token: text('token').notNull().unique(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
});

export const account = sqliteTable('account', {
  id: text('id').primaryKey(),
  accountId: text('account_id').notNull(),
  providerId: text('provider_id').notNull(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  accessTokenExpiresAt: text('access_token_expires_at'),
  refreshTokenExpiresAt: text('refresh_token_expires_at'),
  scope: text('scope'),
  password: text('password'),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const verification = sqliteTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const studioPages = sqliteTable('studio_page', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  page: text('page').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

export const studioPageShare = sqliteTable('studio_page_share', {
  pageId: text('page_id').primaryKey().references(() => studioPages.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  snapshot: text('snapshot').notNull(),
  publishedAt: text('published_at').notNull(),
});

export const userPreferences = sqliteTable('user_preference', {
  userId: text('user_id').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  studioTheme: text('studio_theme').notNull().default('light'),
  updatedAt: text('updated_at').notNull(),
});

/**
 * Owner-scoped library organization, kept separate from reusable component definitions.
 * The concurrent 50-folder limit is enforced by a trigger in the folder migration;
 * Drizzle's schema generator cannot express that trigger.
 */
export const studioComponentFolders = sqliteTable('studio_component_folder', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [uniqueIndex('studio_component_folder_user_name_idx').on(table.userId, table.name)]);

/** Validated component definitions; revision tracks source edits, independently of folders. */
export const studioComponents = sqliteTable('studio_component', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  folderId: text('folder_id').references(() => studioComponentFolders.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  definition: text('definition').notNull(),
  revision: integer('revision').notNull().default(1),
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
}, table => [index('studio_component_user_updated_idx').on(table.userId, table.updatedAt)]);

/** The published snapshot of a component; removing the row revokes the link. */
export const studioComponentShare = sqliteTable('studio_component_share', {
  componentId: text('component_id').primaryKey().references(() => studioComponents.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  snapshot: text('snapshot').notNull(),
  revision: integer('revision').notNull(),
  publishedAt: text('published_at').notNull(),
});

import Database from 'better-sqlite3';

const db = new Database('./local.db');

// إنشاء جدول المستخدمين
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    username TEXT,
    is_active INTEGER DEFAULT 1,
    email_verified INTEGER DEFAULT 0,
    email_verified_at INTEGER,
    pending_email TEXT,
    email_verification_code TEXT,
    email_verification_expires_at INTEGER,
    last_synced_at INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
`);

try {
  db.exec(`ALTER TABLE users ADD COLUMN last_synced_at INTEGER;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN email_verified_at INTEGER;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN pending_email TEXT;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN email_verification_code TEXT;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`ALTER TABLE users ADD COLUMN email_verification_expires_at INTEGER;`);
} catch {
  // Column already exists.
}

db.exec(`CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(email_verified);`);

// إنشاء جدول العناصر
db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('note', 'quote', 'link', 'audio')),
    title TEXT NOT NULL,
    content TEXT,
    url TEXT,
    location TEXT DEFAULT 'inbox' CHECK(location IN ('inbox', 'library', 'archive')),
    is_favorite INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    deleted_at INTEGER
  );
  
  CREATE INDEX IF NOT EXISTS idx_items_user_id ON items(user_id);
  CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
  CREATE INDEX IF NOT EXISTS idx_items_location ON items(location);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS item_shares (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    shared_with_email TEXT NOT NULL,
    permission TEXT NOT NULL CHECK(permission IN ('view', 'edit')) DEFAULT 'view',
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_item_shares_item_id ON item_shares(item_id);
  CREATE INDEX IF NOT EXISTS idx_item_shares_owner_user_id ON item_shares(owner_user_id);
  CREATE INDEX IF NOT EXISTS idx_item_shares_shared_with_email ON item_shares(shared_with_email);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS item_comments (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    parent_comment_id TEXT,
    content TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_item_comments_item_id ON item_comments(item_id);
  CREATE INDEX IF NOT EXISTS idx_item_comments_user_id ON item_comments(user_id);
  CREATE INDEX IF NOT EXISTS idx_item_comments_parent_comment_id ON item_comments(parent_comment_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS user_notifications (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    meta TEXT,
    is_read INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_user_notifications_user_id ON user_notifications(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_notifications_is_read ON user_notifications(is_read);
  CREATE INDEX IF NOT EXISTS idx_user_notifications_created_at ON user_notifications(created_at);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS public_links (
    id TEXT PRIMARY KEY,
    token TEXT NOT NULL UNIQUE,
    item_id TEXT NOT NULL,
    owner_user_id TEXT NOT NULL,
    password_hash TEXT,
    expires_at INTEGER,
    is_revoked INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_public_links_token ON public_links(token);
  CREATE INDEX IF NOT EXISTS idx_public_links_item_id ON public_links(item_id);
  CREATE INDEX IF NOT EXISTS idx_public_links_owner_user_id ON public_links(owner_user_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL,
    key_preview TEXT NOT NULL,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    last_used_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
  CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
  CREATE INDEX IF NOT EXISTS idx_api_keys_is_active ON api_keys(is_active);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS webhook_subscriptions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    url TEXT NOT NULL,
    event TEXT NOT NULL,
    secret TEXT,
    is_active INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_webhooks_user_id ON webhook_subscriptions(user_id);
  CREATE INDEX IF NOT EXISTS idx_webhooks_event ON webhook_subscriptions(event);
  CREATE INDEX IF NOT EXISTS idx_webhooks_is_active ON webhook_subscriptions(is_active);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS item_versions (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_item_versions_item_id ON item_versions(item_id);
  CREATE INDEX IF NOT EXISTS idx_item_versions_user_id ON item_versions(user_id);
  CREATE INDEX IF NOT EXISTS idx_item_versions_created_at ON item_versions(created_at);
`);

// إنشاء جدول المهام
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
    blocked_by_task_id TEXT,
    location_lat TEXT,
    location_lng TEXT,
    location_radius_meters INTEGER,
    is_urgent INTEGER DEFAULT 0,
    is_important INTEGER DEFAULT 0,
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high')),
    is_completed INTEGER DEFAULT 0,
    completed_at INTEGER,
    recurrence TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    deleted_at INTEGER
  );
  
  CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);
  CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
`);

try {
  db.exec(`ALTER TABLE tasks ADD COLUMN blocked_by_task_id TEXT;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`ALTER TABLE tasks ADD COLUMN location_lat TEXT;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`ALTER TABLE tasks ADD COLUMN location_lng TEXT;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`ALTER TABLE tasks ADD COLUMN location_radius_meters INTEGER;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`ALTER TABLE tasks ADD COLUMN is_urgent INTEGER DEFAULT 0;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`ALTER TABLE tasks ADD COLUMN is_important INTEGER DEFAULT 0;`);
} catch {
  // Column already exists.
}

try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_blocked_by ON tasks(blocked_by_task_id);`);
} catch {
  // Legacy DB might still be migrating; index creation can be retried next run.
}

try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_urgent ON tasks(is_urgent);`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_tasks_important ON tasks(is_important);`);
} catch {
  // Ignore index creation errors on legacy states.
}

// إنشاء جدول اليوميات
db.exec(`
  CREATE TABLE IF NOT EXISTS journal (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    entry_date TEXT NOT NULL,
    title TEXT,
    content TEXT NOT NULL,
    mood TEXT,
    location TEXT,
    weather TEXT,
    is_locked INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now')),
    deleted_at INTEGER
  );
  
  CREATE INDEX IF NOT EXISTS idx_journal_user_id ON journal(user_id);
  CREATE INDEX IF NOT EXISTS idx_journal_entry_date ON journal(entry_date);
`);

// إنشاء جدول الوسوم
db.exec(`
  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    color TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  
  CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id);
  
  CREATE TABLE IF NOT EXISTS item_tags (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    tag_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  
  CREATE INDEX IF NOT EXISTS idx_item_tags_item_id ON item_tags(item_id);
  CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);
`);

// إنشاء جدول المرفقات
db.exec(`
  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    item_id TEXT,
    journal_id TEXT,
    type TEXT NOT NULL CHECK(type IN ('audio', 'image')),
    filename TEXT NOT NULL,
    file_url TEXT NOT NULL,
    file_size INTEGER,
    duration INTEGER,
    transcription TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );
  
  CREATE INDEX IF NOT EXISTS idx_attachments_item_id ON attachments(item_id);
  CREATE INDEX IF NOT EXISTS idx_attachments_journal_id ON attachments(journal_id);
`);

// إنشاء جدول التصنيفات
db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    icon TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);

  CREATE TABLE IF NOT EXISTS item_categories (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    category_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_item_categories_item_id ON item_categories(item_id);
  CREATE INDEX IF NOT EXISTS idx_item_categories_category_id ON item_categories(category_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS devices (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL,
    platform TEXT NOT NULL,
    push_token TEXT,
    is_active INTEGER DEFAULT 1,
    last_active_at INTEGER DEFAULT (strftime('%s', 'now')),
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);
  CREATE INDEX IF NOT EXISTS idx_devices_device_id ON devices(device_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS task_time_entries (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_seconds INTEGER,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_task_time_entries_user_id ON task_time_entries(user_id);
  CREATE INDEX IF NOT EXISTS idx_task_time_entries_task_id ON task_time_entries(task_id);
  CREATE INDEX IF NOT EXISTS idx_task_time_entries_started_at ON task_time_entries(started_at);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS habits (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT NOT NULL,
    streak INTEGER DEFAULT 0,
    done_today INTEGER DEFAULT 0,
    last_completed_date TEXT,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_habits_user_id ON habits(user_id);
  CREATE INDEX IF NOT EXISTS idx_habits_updated_at ON habits(updated_at);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    is_completed INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS goal_milestones (
    id TEXT PRIMARY KEY,
    goal_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_completed INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE TABLE IF NOT EXISTS milestone_tasks (
    id TEXT PRIMARY KEY,
    milestone_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    created_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_goals_user_id ON goals(user_id);
  CREATE INDEX IF NOT EXISTS idx_goal_milestones_goal_id ON goal_milestones(goal_id);
  CREATE INDEX IF NOT EXISTS idx_milestone_tasks_milestone_id ON milestone_tasks(milestone_id);
  CREATE INDEX IF NOT EXISTS idx_milestone_tasks_task_id ON milestone_tasks(task_id);
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS subtasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    is_completed INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,
    created_at INTEGER DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER DEFAULT (strftime('%s', 'now'))
  );

  CREATE INDEX IF NOT EXISTS idx_subtasks_user_id ON subtasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
`);

console.log('✅ Database tables created successfully!');
db.close();

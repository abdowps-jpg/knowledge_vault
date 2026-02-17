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

// إنشاء جدول المهام
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    due_date TEXT,
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

console.log('✅ Database tables created successfully!');
db.close();

import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const dataDir = path.join(process.cwd(), "data");
const dbPath = path.join(dataDir, "workday.db");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

export const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS workspaces (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    role TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, workspace_id),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS daily_plans (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    date TEXT NOT NULL,
    visibility TEXT NOT NULL,
    submitted INTEGER NOT NULL DEFAULT 0,
    reviewed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(user_id, workspace_id, date),
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY,
    daily_plan_id TEXT NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    estimated_minutes INTEGER,
    actual_minutes INTEGER,
    status TEXT NOT NULL,
    notes TEXT,
    start_time TEXT,
    end_time TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(daily_plan_id) REFERENCES daily_plans(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS reflections (
    id TEXT PRIMARY KEY,
    daily_plan_id TEXT UNIQUE NOT NULL,
    what_went_well TEXT,
    blockers TEXT,
    tomorrow_focus TEXT,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(daily_plan_id) REFERENCES daily_plans(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    daily_plan_id TEXT NOT NULL,
    task_id TEXT,
    author_id TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(daily_plan_id) REFERENCES daily_plans(id) ON DELETE CASCADE,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY(author_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(workspace_id, name),
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );
`);

const commentsColumns = db.prepare("PRAGMA table_info(comments)").all() as Array<{
  name: string;
}>;
const hasTaskId = commentsColumns.some((column) => column.name === "task_id");
if (!hasTaskId) {
  db.exec("ALTER TABLE comments ADD COLUMN task_id TEXT");
}

const tasksColumns = db.prepare("PRAGMA table_info(tasks)").all() as Array<{
  name: string;
}>;
const hasStartTime = tasksColumns.some((column) => column.name === "start_time");
const hasEndTime = tasksColumns.some((column) => column.name === "end_time");
if (!hasStartTime) {
  db.exec("ALTER TABLE tasks ADD COLUMN start_time TEXT");
}
if (!hasEndTime) {
  db.exec("ALTER TABLE tasks ADD COLUMN end_time TEXT");
}

const categoriesColumns = db
  .prepare("PRAGMA table_info(categories)")
  .all() as Array<{ name: string }>;
if (categoriesColumns.length === 0) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(workspace_id, name), FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE)"
  );
}

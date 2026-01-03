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
    org_id TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(created_by) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS org_members (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(org_id, user_id),
    FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS org_invites (
    id TEXT PRIMARY KEY,
    org_id TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    accepted_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
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
    daily_plan_id TEXT,
    user_id TEXT,
    workspace_id TEXT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    estimated_minutes INTEGER,
    actual_minutes INTEGER,
    status TEXT NOT NULL,
    notes TEXT,
    priority TEXT NOT NULL DEFAULT 'none',
    due_date TEXT,
    start_time TEXT,
    end_time TEXT,
    recurrence_rule TEXT,
    recurrence_time TEXT,
    recurrence_active INTEGER NOT NULL DEFAULT 1,
    recurrence_parent_id TEXT,
    recurrence_start_date TEXT,
    repeat_till TEXT,
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(daily_plan_id) REFERENCES daily_plans(id) ON DELETE CASCADE,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
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

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    appearance TEXT NOT NULL DEFAULT 'light',
    task_add_position TEXT NOT NULL DEFAULT 'bottom',
    default_est_minutes INTEGER NOT NULL DEFAULT 15,
    due_soon_days INTEGER NOT NULL DEFAULT 3,
    ai_confirm INTEGER NOT NULL DEFAULT 1,
    ai_routine TEXT,
    ai_work_hours TEXT,
    ai_preferences TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_attachments (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    url TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_subtasks (
    id TEXT PRIMARY KEY,
    task_id TEXT NOT NULL,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    estimated_minutes INTEGER,
    actual_minutes INTEGER,
    start_time TEXT,
    end_time TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(task_id) REFERENCES tasks(id) ON DELETE CASCADE
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
    color TEXT NOT NULL DEFAULT '#64748b',
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
  notnull: number;
}>;
const hasStartTime = tasksColumns.some((column) => column.name === "start_time");
const hasEndTime = tasksColumns.some((column) => column.name === "end_time");
if (!hasStartTime) {
  db.exec("ALTER TABLE tasks ADD COLUMN start_time TEXT");
}
if (!hasEndTime) {
  db.exec("ALTER TABLE tasks ADD COLUMN end_time TEXT");
}
if (!tasksColumns.some((column) => column.name === "priority")) {
  db.exec("ALTER TABLE tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'none'");
}
if (!tasksColumns.some((column) => column.name === "due_date")) {
  db.exec("ALTER TABLE tasks ADD COLUMN due_date TEXT");
}
if (!tasksColumns.some((column) => column.name === "recurrence_rule")) {
  db.exec("ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT");
}
if (!tasksColumns.some((column) => column.name === "recurrence_time")) {
  db.exec("ALTER TABLE tasks ADD COLUMN recurrence_time TEXT");
}
if (!tasksColumns.some((column) => column.name === "recurrence_active")) {
  db.exec(
    "ALTER TABLE tasks ADD COLUMN recurrence_active INTEGER NOT NULL DEFAULT 1"
  );
}
if (!tasksColumns.some((column) => column.name === "recurrence_parent_id")) {
  db.exec("ALTER TABLE tasks ADD COLUMN recurrence_parent_id TEXT");
}
if (!tasksColumns.some((column) => column.name === "recurrence_start_date")) {
  db.exec("ALTER TABLE tasks ADD COLUMN recurrence_start_date TEXT");
}
if (!tasksColumns.some((column) => column.name === "repeat_till")) {
  db.exec("ALTER TABLE tasks ADD COLUMN repeat_till TEXT");
}
if (!tasksColumns.some((column) => column.name === "user_id")) {
  db.exec("ALTER TABLE tasks ADD COLUMN user_id TEXT");
}
if (!tasksColumns.some((column) => column.name === "workspace_id")) {
  db.exec("ALTER TABLE tasks ADD COLUMN workspace_id TEXT");
}
const dailyPlanColumn = tasksColumns.find(
  (column) => column.name === "daily_plan_id"
);
if (dailyPlanColumn?.notnull === 1) {
  db.exec("PRAGMA foreign_keys=off");
  db.exec(`
    CREATE TABLE tasks_new (
      id TEXT PRIMARY KEY,
      daily_plan_id TEXT,
      user_id TEXT,
      workspace_id TEXT,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      estimated_minutes INTEGER,
      actual_minutes INTEGER,
      status TEXT NOT NULL,
      notes TEXT,
      priority TEXT NOT NULL DEFAULT 'none',
      due_date TEXT,
      start_time TEXT,
      end_time TEXT,
      recurrence_rule TEXT,
      recurrence_time TEXT,
      recurrence_active INTEGER NOT NULL DEFAULT 1,
      recurrence_parent_id TEXT,
      recurrence_start_date TEXT,
      repeat_till TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(daily_plan_id) REFERENCES daily_plans(id) ON DELETE CASCADE,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
    );
  `);
  db.exec(`
    INSERT INTO tasks_new (
      id,
      daily_plan_id,
      user_id,
      workspace_id,
      title,
      category,
      estimated_minutes,
      actual_minutes,
      status,
      notes,
      priority,
      due_date,
      start_time,
      end_time,
      recurrence_rule,
      recurrence_time,
      recurrence_active,
      recurrence_parent_id,
      recurrence_start_date,
      repeat_till,
      position,
      created_at,
      updated_at
    )
    SELECT
      id,
      daily_plan_id,
      user_id,
      workspace_id,
      title,
      category,
      estimated_minutes,
      actual_minutes,
      status,
      notes,
      priority,
      due_date,
      start_time,
      end_time,
      recurrence_rule,
      recurrence_time,
      recurrence_active,
      recurrence_parent_id,
      recurrence_start_date,
      repeat_till,
      position,
      created_at,
      updated_at
    FROM tasks;
  `);
  db.exec("DROP TABLE tasks");
  db.exec("ALTER TABLE tasks_new RENAME TO tasks");
  db.exec("PRAGMA foreign_keys=on");
}
db.exec(`
  UPDATE tasks
  SET user_id = (SELECT user_id FROM daily_plans WHERE daily_plans.id = tasks.daily_plan_id),
      workspace_id = (SELECT workspace_id FROM daily_plans WHERE daily_plans.id = tasks.daily_plan_id)
  WHERE daily_plan_id IS NOT NULL
    AND (user_id IS NULL OR workspace_id IS NULL);
`);

const workspaceColumns = db
  .prepare("PRAGMA table_info(workspaces)")
  .all() as Array<{ name: string }>;
if (!workspaceColumns.some((column) => column.name === "org_id")) {
  db.exec("ALTER TABLE workspaces ADD COLUMN org_id TEXT");
}
if (!workspaceColumns.some((column) => column.name === "is_default")) {
  db.exec("ALTER TABLE workspaces ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0");
}

const categoriesColumns = db
  .prepare("PRAGMA table_info(categories)")
  .all() as Array<{ name: string }>;
if (categoriesColumns.length === 0) {
  db.exec(
    "CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT '#64748b', created_at TEXT NOT NULL, UNIQUE(workspace_id, name), FOREIGN KEY(workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE)"
  );
} else if (!categoriesColumns.some((column) => column.name === "color")) {
  db.exec("ALTER TABLE categories ADD COLUMN color TEXT NOT NULL DEFAULT '#64748b'");
}

const subtaskColumns = db
  .prepare("PRAGMA table_info(task_subtasks)")
  .all() as Array<{ name: string }>;
if (!subtaskColumns.some((column) => column.name === "estimated_minutes")) {
  db.exec("ALTER TABLE task_subtasks ADD COLUMN estimated_minutes INTEGER");
}
if (!subtaskColumns.some((column) => column.name === "actual_minutes")) {
  db.exec("ALTER TABLE task_subtasks ADD COLUMN actual_minutes INTEGER");
}
if (!subtaskColumns.some((column) => column.name === "start_time")) {
  db.exec("ALTER TABLE task_subtasks ADD COLUMN start_time TEXT");
}
if (!subtaskColumns.some((column) => column.name === "end_time")) {
  db.exec("ALTER TABLE task_subtasks ADD COLUMN end_time TEXT");
}

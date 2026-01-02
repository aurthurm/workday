import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { db } from "../src/lib/db";
import {
  createMembership,
  createUser,
  createWorkspace,
  getUserByEmail,
} from "../src/lib/data";

const now = () => new Date().toISOString();

async function seed() {
  const existing = getUserByEmail("admin@workday.local");
  if (existing) {
    console.log("Seed data already exists.");
    return;
  }

  const passwordHash = await bcrypt.hash("password123", 10);
  const adminId = createUser({
    email: "admin@workday.local",
    name: "Avery Admin",
    passwordHash,
  });
  const supervisorId = createUser({
    email: "supervisor@workday.local",
    name: "Jordan Supervisor",
    passwordHash,
  });
  const memberId = createUser({
    email: "member@workday.local",
    name: "Riley Member",
    passwordHash,
  });

  const workspaceId = createWorkspace({
    name: "Workday Demo Org",
    type: "organization",
  });

  createMembership({ userId: adminId, workspaceId, role: "admin" });
  createMembership({ userId: supervisorId, workspaceId, role: "supervisor" });
  createMembership({ userId: memberId, workspaceId, role: "member" });

  const categories = ["Admin", "Technical", "Field", "Other"];
  categories.forEach((name) => {
    db.prepare(
      "INSERT INTO categories (id, workspace_id, name, created_at) VALUES (?, ?, ?, ?)"
    ).run(randomUUID(), workspaceId, name, now());
  });

  const today = new Date().toISOString().slice(0, 10);
  const planId = randomUUID();

  db.prepare(
    "INSERT INTO daily_plans (id, user_id, workspace_id, date, visibility, submitted, reviewed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 1, 0, ?, ?)"
  ).run(planId, memberId, workspaceId, today, "team", now(), now());

  const tasks = [
    {
      title: "Prep morning site review",
      category: "Field",
      status: "done",
      estimated: 30,
      actual: 35,
    },
    {
      title: "Update safety checklist",
      category: "Admin",
      status: "planned",
      estimated: 45,
      actual: null,
    },
    {
      title: "Troubleshoot line sensor",
      category: "Technical",
      status: "planned",
      estimated: 60,
      actual: null,
    },
  ];

  tasks.forEach((task, index) => {
    db.prepare(
      "INSERT INTO tasks (id, daily_plan_id, title, category, estimated_minutes, actual_minutes, status, notes, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    ).run(
      randomUUID(),
      planId,
      task.title,
      task.category,
      task.estimated,
      task.actual,
      task.status,
      "",
      index + 1,
      now(),
      now()
    );
  });

  db.prepare(
    "INSERT INTO reflections (id, daily_plan_id, what_went_well, blockers, tomorrow_focus, updated_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    randomUUID(),
    planId,
    "Quick alignment with the floor team kept everyone moving.",
    "Waiting on new replacement parts for the sensor.",
    "Complete troubleshooting, hand off findings to engineering.",
    now()
  );

  db.prepare(
    "INSERT INTO comments (id, daily_plan_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(
    randomUUID(),
    planId,
    supervisorId,
    "Thanks for logging the sensor issue. Let me know if you need backup to close it today.",
    now()
  );

  console.log("Seed data created.");
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});

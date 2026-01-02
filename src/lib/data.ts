import { randomUUID } from "crypto";
import { db } from "@/lib/db";

export type Role = "member" | "supervisor" | "admin";

export type UserRecord = {
  id: string;
  email: string;
  name: string;
};

export type WorkspaceRecord = {
  id: string;
  name: string;
  type: "personal" | "organization";
};

export type MembershipRecord = {
  id: string;
  user_id: string;
  workspace_id: string;
  role: Role;
};

const now = () => new Date().toISOString();

export function getUserByEmail(email: string) {
  return db
    .prepare(
      "SELECT id, email, name, password_hash as passwordHash FROM users WHERE email = ?"
    )
    .get(email) as
    | { id: string; email: string; name: string; passwordHash: string }
    | undefined;
}

export function getUserById(id: string) {
  return db
    .prepare("SELECT id, email, name FROM users WHERE id = ?")
    .get(id) as UserRecord | undefined;
}

export function createUser(params: {
  email: string;
  name: string;
  passwordHash: string;
}) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, params.email, params.name, params.passwordHash, now());
  return id;
}

export function createWorkspace(params: {
  name: string;
  type: "personal" | "organization";
}) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO workspaces (id, name, type, created_at) VALUES (?, ?, ?, ?)"
  ).run(id, params.name, params.type, now());
  return id;
}

export function createMembership(params: {
  userId: string;
  workspaceId: string;
  role: Role;
}) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO memberships (id, user_id, workspace_id, role, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, params.userId, params.workspaceId, params.role, now());
  return id;
}

export function listMembershipsForUser(userId: string) {
  return db
    .prepare(
      "SELECT memberships.id, memberships.user_id, memberships.workspace_id, memberships.role, workspaces.name, workspaces.type FROM memberships JOIN workspaces ON memberships.workspace_id = workspaces.id WHERE memberships.user_id = ? ORDER BY workspaces.created_at"
    )
    .all(userId) as Array<
    MembershipRecord & { name: string; type: "personal" | "organization" }
  >;
}

export function getMembershipForUser(
  userId: string,
  workspaceId: string
): MembershipRecord | undefined {
  return db
    .prepare(
      "SELECT id, user_id, workspace_id, role FROM memberships WHERE user_id = ? AND workspace_id = ?"
    )
    .get(userId, workspaceId) as MembershipRecord | undefined;
}

export function getWorkspaceById(id: string) {
  return db
    .prepare("SELECT id, name, type FROM workspaces WHERE id = ?")
    .get(id) as WorkspaceRecord | undefined;
}

export function getActiveWorkspace(
  userId: string,
  requestedId?: string | null
) {
  if (requestedId) {
    const membership = getMembershipForUser(userId, requestedId);
    if (membership) {
      return {
        workspace: getWorkspaceById(requestedId),
        membership,
      };
    }
  }

  const memberships = listMembershipsForUser(userId);
  if (memberships.length === 0) {
    return null;
  }

  const primary = memberships[0];
  return {
    workspace: {
      id: primary.workspace_id,
      name: primary.name,
      type: primary.type,
    } as WorkspaceRecord,
    membership: {
      id: primary.id,
      user_id: primary.user_id,
      workspace_id: primary.workspace_id,
      role: primary.role,
    } as MembershipRecord,
  };
}

export function upsertDailyPlan(params: {
  userId: string;
  workspaceId: string;
  date: string;
  visibility: "team" | "private";
}) {
  const existing = db
    .prepare(
      "SELECT id FROM daily_plans WHERE user_id = ? AND workspace_id = ? AND date = ?"
    )
    .get(params.userId, params.workspaceId, params.date) as
    | { id: string }
    | undefined;

  if (existing) {
    db.prepare(
      "UPDATE daily_plans SET visibility = ?, updated_at = ? WHERE id = ?"
    ).run(params.visibility, now(), existing.id);
    return existing.id;
  }

  const id = randomUUID();
  const timestamp = now();
  db.prepare(
    "INSERT INTO daily_plans (id, user_id, workspace_id, date, visibility, submitted, reviewed, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?)"
  ).run(
    id,
    params.userId,
    params.workspaceId,
    params.date,
    params.visibility,
    timestamp,
    timestamp
  );
  return id;
}

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
  org_id?: string | null;
  is_default?: number;
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
  orgId?: string | null;
  isDefault?: number;
}) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO workspaces (id, name, type, org_id, is_default, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(
    id,
    params.name,
    params.type,
    params.orgId ?? null,
    params.isDefault ?? 0,
    now()
  );
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
      "SELECT memberships.id, memberships.user_id, memberships.workspace_id, memberships.role, workspaces.name, workspaces.type, workspaces.org_id, workspaces.is_default FROM memberships JOIN workspaces ON memberships.workspace_id = workspaces.id WHERE memberships.user_id = ? ORDER BY workspaces.created_at"
    )
    .all(userId) as Array<
    MembershipRecord & {
      name: string;
      type: "personal" | "organization";
      org_id: string | null;
      is_default: number;
    }
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
    .prepare("SELECT id, name, type, org_id, is_default FROM workspaces WHERE id = ?")
    .get(id) as WorkspaceRecord | undefined;
}

export type OrgRole = "owner" | "admin" | "supervisor" | "member";

export type OrganizationRecord = {
  id: string;
  name: string;
  slug: string;
};

export function createOrganization(params: {
  name: string;
  slug: string;
  createdBy: string;
}) {
  const id = randomUUID();
  db.prepare(
    "INSERT INTO organizations (id, name, slug, created_by, created_at) VALUES (?, ?, ?, ?, ?)"
  ).run(id, params.name, params.slug, params.createdBy, now());
  return id;
}

export function addOrgMember(params: {
  orgId: string;
  userId: string;
  role: OrgRole;
  status: "active" | "invited" | "disabled";
}) {
  const id = randomUUID();
  db.prepare(
    "INSERT OR IGNORE INTO org_members (id, org_id, user_id, role, status, created_at) VALUES (?, ?, ?, ?, ?, ?)"
  ).run(id, params.orgId, params.userId, params.role, params.status, now());
  return id;
}

export function listOrganizationsForUser(userId: string) {
  return db
    .prepare(
      "SELECT organizations.id, organizations.name, organizations.slug, org_members.role, org_members.status FROM org_members JOIN organizations ON organizations.id = org_members.org_id WHERE org_members.user_id = ? AND org_members.status = 'active' ORDER BY organizations.created_at DESC"
    )
    .all(userId) as Array<
    OrganizationRecord & { role: OrgRole; status: string }
  >;
}

export function getOrganizationById(id: string) {
  return db
    .prepare("SELECT id, name, slug FROM organizations WHERE id = ?")
    .get(id) as OrganizationRecord | undefined;
}

export function getOrgMembership(userId: string, orgId: string) {
  return db
    .prepare(
      "SELECT id, org_id, user_id, role, status FROM org_members WHERE user_id = ? AND org_id = ?"
    )
    .get(userId, orgId) as
    | { id: string; org_id: string; user_id: string; role: OrgRole; status: string }
    | undefined;
}

export function getDefaultOrgWorkspace(orgId: string) {
  return db
    .prepare(
      "SELECT id, name, type, org_id, is_default FROM workspaces WHERE org_id = ? AND is_default = 1 LIMIT 1"
    )
    .get(orgId) as WorkspaceRecord | undefined;
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

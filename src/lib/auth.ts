import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { UserRecord } from "@/lib/data";
import { getUserById } from "@/lib/data";

export type Session = {
  userId: string;
  email: string;
  name: string;
};

const sessionCookie = "workday_session";
const workspaceCookie = "workday_workspace";

const secret = new TextEncoder().encode(
  process.env.AUTH_SECRET || "workday-dev-secret"
);

export async function createSessionToken(session: Session) {
  return new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function verifySessionToken(token: string) {
  const { payload } = await jwtVerify(token, secret);
  return payload as unknown as Session;
}

export async function setSession(session: Session) {
  const token = await createSessionToken(session);
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.set(sessionCookie, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookie)?.value;
  if (!token) return null;
  try {
    return await verifySessionToken(token);
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<UserRecord | null> {
  const session = await getSession();
  if (!session) return null;
  return getUserById(session.userId) ?? null;
}

export async function setWorkspaceCookie(workspaceId: string) {
  const cookieStore = await cookies();
  cookieStore.set(workspaceCookie, workspaceId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getWorkspaceCookie() {
  const cookieStore = await cookies();
  return cookieStore.get(workspaceCookie)?.value ?? null;
}

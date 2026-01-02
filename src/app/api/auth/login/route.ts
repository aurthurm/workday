import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getUserByEmail, listMembershipsForUser } from "@/lib/data";
import { setSession, setWorkspaceCookie } from "@/lib/auth";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    email?: string;
    password?: string;
  };

  const email = body.email?.trim().toLowerCase();
  const password = body.password?.trim();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password are required." },
      { status: 400 }
    );
  }

  const user = getUserByEmail(email);
  if (!user) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 }
    );
  }

  await setSession({ userId: user.id, email: user.email, name: user.name });

  const memberships = listMembershipsForUser(user.id);
  if (memberships.length > 0) {
    await setWorkspaceCookie(memberships[0].workspace_id);
  }

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
}

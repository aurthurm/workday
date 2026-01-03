import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim().toLowerCase() ?? "";
  if (!query) {
    return NextResponse.json({ users: [] });
  }

  const users = db
    .prepare(
      `SELECT id, name, email
       FROM users
       WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ?
       ORDER BY name
       LIMIT 10`
    )
    .all(`%${query}%`, `%${query}%`) as Array<{
    id: string;
    name: string;
    email: string;
  }>;

  return NextResponse.json({ users });
}

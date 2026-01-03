import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { parseSearchParams } from "@/lib/validation";
import { z } from "zod";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseSearchParams(
    searchParams,
    z.object({ query: z.string().trim().min(1).max(80).optional() })
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }
  const query = parsed.data.query?.toLowerCase() ?? "";
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

import { z } from "zod";

export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export async function parseJson<T>(
  request: Request,
  schema: z.ZodSchema<T>
): Promise<ValidationResult<T>> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return { ok: false, error: "Invalid JSON payload." };
  }
  const result = schema.safeParse(payload);
  if (!result.success) {
    return { ok: false, error: "Invalid request payload." };
  }
  return { ok: true, data: result.data };
}

export function parseSearchParams<T>(
  params: URLSearchParams,
  schema: z.ZodSchema<T>
): ValidationResult<T> {
  const raw: Record<string, string> = {};
  params.forEach((value, key) => {
    raw[key] = value;
  });
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, error: "Invalid request parameters." };
  }
  return { ok: true, data: result.data };
}

export const uuidSchema = z.string().uuid();
export const emailSchema = z.string().trim().email().max(254);
export const nameSchema = z.string().trim().min(1).max(80);
export const passwordSchema = z.string().min(8).max(128);
export const titleSchema = z.string().trim().min(1).max(200);
export const notesSchema = z.string().trim().max(4000);
export const categorySchema = z.string().trim().min(1).max(60);
export const colorSchema = z.string().trim().regex(/^#(?:[0-9a-fA-F]{3}){1,2}$/);
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
export const urlSchema = z.string().trim().url().max(2048);
export const textSchema = z.string().trim().min(1).max(1000);
export const longTextSchema = z.string().trim().min(1).max(8000);

export const recurrenceSchema = z.enum([
  "none",
  "daily_weekdays",
  "weekly",
  "biweekly",
  "monthly",
  "monthly_nth_weekday",
  "quarterly",
  "yearly",
  "custom",
  "specific_time",
]);

export const statusSchema = z.enum([
  "planned",
  "done",
  "skipped",
  "cancelled",
  "unplanned",
]);

export const prioritySchema = z.enum(["high", "medium", "low", "none"]);

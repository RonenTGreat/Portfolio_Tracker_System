/**
 * API response shapes and the error envelope.
 *
 * One envelope for every route so the client has exactly one thing to read on
 * failure. Design §7 asks that errors be "stated plainly in the interface's
 * voice" — that requires the server to send a sentence a component can render
 * verbatim, rather than a status code the client has to invent copy for.
 *
 * Field-level errors are returned separately from the summary message so a form
 * can put "Enter a GHS amount" beside the field that caused it while still
 * having a line to show at the top.
 */

import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";

export interface ApiError {
  /** A complete sentence, safe to render as-is. */
  error: string;
  /** Field path -> message, for form-level display. */
  fields?: Record<string, string>;
}

export function ok<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function created<T>(data: T): NextResponse {
  return NextResponse.json(data, { status: 201 });
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function badRequest(
  error: string,
  fields?: Record<string, string>,
): NextResponse {
  return NextResponse.json({ error, fields } satisfies ApiError, {
    status: 400,
  });
}

export function notFound(error: string): NextResponse {
  return NextResponse.json({ error } satisfies ApiError, { status: 404 });
}

/** 409 — the request was well-formed but conflicts with what already exists. */
export function conflict(error: string): NextResponse {
  return NextResponse.json({ error } satisfies ApiError, { status: 409 });
}

/**
 * 401 — not signed in (FR-8).
 *
 * Distinct from 403 on purpose: the client uses the difference to decide between
 * sending the user to /sign-in and telling them they lack the role. Collapsing
 * both into one status would make a signed-in USER hitting an Admin route get
 * bounced to a sign-in form they are already past.
 */
export function unauthorized(
  error = "Sign in to continue.",
): NextResponse {
  return NextResponse.json({ error } satisfies ApiError, { status: 401 });
}

/** 403 — signed in, but not allowed (FR-10's Admin-only routes). */
export function forbidden(
  error = "That action is limited to admins.",
): NextResponse {
  return NextResponse.json({ error } satisfies ApiError, { status: 403 });
}

/** 429 — rate limited. FR-8's lockout after repeated failed sign-ins. */
export function tooManyRequests(error: string): NextResponse {
  return NextResponse.json({ error } satisfies ApiError, { status: 429 });
}

/**
 * 500. The real error is logged server-side and deliberately not returned: it
 * can contain a connection string or a constraint name, and neither is useful
 * to the person reading the screen.
 */
export function serverError(context: string, cause: unknown): NextResponse {
  console.error(`[api] ${context}`, cause);
  return NextResponse.json(
    {
      error: `Couldn't ${context} — something went wrong on our side. Try again.`,
    } satisfies ApiError,
    { status: 500 },
  );
}

/** Flatten a ZodError into the envelope's `fields` map. */
export function fieldErrors(error: ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "_";
    // First message per path wins — a field with three problems still only has
    // room for one sentence beneath it.
    fields[path] ??= issue.message;
  }
  return fields;
}

/**
 * Parse and validate a JSON request body.
 *
 * Returns a discriminated result rather than throwing, so a route reads as a
 * straight line: parse, bail on failure, proceed. Malformed JSON is treated as
 * a validation failure, not a crash — an aborted request mid-upload should not
 * page anyone.
 */
export async function readJson<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<
  { ok: true; data: T } | { ok: false; response: NextResponse }
> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return {
      ok: false,
      response: badRequest("The request body wasn't valid JSON."),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields = fieldErrors(result.error);
    // Prefer a specific field message as the summary when there's only one
    // problem; a bare "Check the highlighted fields" is useless at that point.
    const only = Object.values(fields);
    const summary =
      only.length === 1
        ? only[0]
        : "Some values need attention — check the highlighted fields.";
    return { ok: false, response: badRequest(summary, fields) };
  }

  return { ok: true, data: result.data };
}

/**
 * Client-side counterpart: unwrap a fetch Response into data or a message.
 * Kept beside the server helpers so the envelope is defined once and both ends
 * agree on it by construction.
 */
export async function readApiError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiError;
    if (typeof body?.error === "string" && body.error) return body.error;
  } catch {
    // fall through to the generic line
  }
  return "Something went wrong. Try again.";
}

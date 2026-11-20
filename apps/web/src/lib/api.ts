import "server-only";
import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError } from "./session";

/** Wraps a route handler: maps HttpError and ZodError to JSON responses. */
export function handler<Args extends unknown[]>(fn: (...args: Args) => Promise<Response>) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof HttpError) {
        return NextResponse.json({ error: err.message }, { status: err.status });
      }
      if (err instanceof z.ZodError) {
        return NextResponse.json({ error: "Invalid request", issues: err.issues }, { status: 400 });
      }
      console.error(err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "Body must be JSON");
  }
}

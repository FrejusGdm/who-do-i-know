import { NextResponse } from "next/server";
import { z } from "zod";
import { requireSession } from "@/lib/auth-guard";
import { isTrustedMutation, RequestError } from "@/lib/request-security";
import { NetworkError } from "./store";

export async function networkResponse(
  request: Request,
  action: (userId: string) => Promise<unknown>,
  successStatus: 200 | 201 | 202 = 200,
) {
  try {
    const { session, error } = await requireSession();
    if (error) return error;
    const origin =
      process.env.BETTER_AUTH_URL ??
      (process.env.NODE_ENV !== "production"
        ? "http://localhost:3000"
        : undefined);
    if (!isTrustedMutation(request, origin))
      throw new RequestError(403, "Untrusted request origin");
    return NextResponse.json(await action(session.user.id), {
      status: successStatus,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (error instanceof NetworkError || error instanceof RequestError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof z.ZodError)
      return NextResponse.json(
        {
          error: "Check the highlighted fields",
          issues: error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          })),
        },
        { status: 400 },
      );
    const cause =
      error instanceof Error && "cause" in error ? error.cause : error;
    if (
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      cause.code === "23505"
    )
      return NextResponse.json(
        {
          error:
            "This record already exists. Review it before creating another.",
        },
        { status: 409 },
      );
    // Never serialize a DB/model exception: it may contain notes, queries or credentials.
    console.error("Network request failed");
    return NextResponse.json(
      {
        error:
          "This action could not be saved. Your input is still available; please retry.",
      },
      { status: 500 },
    );
  }
}

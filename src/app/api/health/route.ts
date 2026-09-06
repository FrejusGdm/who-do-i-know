export const dynamic = "force-dynamic";

// Public liveness only. Deployment checks must verify authentication and storage separately.
export function GET() {
  return Response.json(
    { status: "ok" },
    { headers: { "Cache-Control": "no-store" } },
  );
}

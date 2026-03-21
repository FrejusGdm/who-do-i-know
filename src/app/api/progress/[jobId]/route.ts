import { NextRequest } from "next/server";
import { getProgress } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  const { jobId } = params;

  const encoder = new TextEncoder();
  let lastIndex = 0;
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));
        } catch {
          closed = true;
        }
      };

      const heartbeat = setInterval(() => {
        if (closed) {
          clearInterval(heartbeat);
          return;
        }
        send(JSON.stringify({ type: "heartbeat" }));
      }, 15000);

      const poll = setInterval(() => {
        if (closed) {
          clearInterval(poll);
          clearInterval(heartbeat);
          return;
        }

        const events = getProgress(jobId);
        while (lastIndex < events.length) {
          const event = events[lastIndex];
          send(JSON.stringify({ type: "progress", ...event }));

          if (event.stage === "ready" || event.stage === "error") {
            closed = true;
            clearInterval(poll);
            clearInterval(heartbeat);
            try {
              controller.close();
            } catch { /* already closed */ }
            return;
          }
          lastIndex++;
        }
      }, 500);

      setTimeout(() => {
        closed = true;
        clearInterval(poll);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch { /* already closed */ }
      }, 5 * 60 * 1000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

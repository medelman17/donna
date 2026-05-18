import { NextRequest } from "next/server";
import Redis from "ioredis";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;
  const redisUrl = process.env.REDIS_URL || "redis://localhost:63790";

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const sub = new Redis(redisUrl);
      sub.subscribe(`scout:enrich:${login}`);

      sub.on("message", (_channel: string, message: string) => {
        controller.enqueue(encoder.encode(`data: ${message}\n\n`));
      });

      const cleanup = () => {
        sub.unsubscribe();
        sub.quit();
        try { controller.close(); } catch {}
      };

      request.signal.addEventListener("abort", cleanup);
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

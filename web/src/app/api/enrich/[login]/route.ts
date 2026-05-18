import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enrichmentTools, ENRICHMENT_SYSTEM_PROMPT } from "@/lib/tools";

export const maxDuration = 300;

export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolName: string; args: string }
  | { type: "tool-result"; toolName: string; result: string }
  | { type: "done" };

const encoder = new TextEncoder();

function formatEvent(event: StreamEvent): Uint8Array {
  return encoder.encode("data: " + JSON.stringify(event) + "\n\n");
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;

  const candidate = await prisma.candidate.findUnique({ where: { login } });
  if (!candidate) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const result = streamText({
    model: anthropic("claude-opus-4-7"),
    system: ENRICHMENT_SYSTEM_PROMPT,
    prompt: `Research the GitHub developer '${login}' who forked willchen96/mike (an AI legal platform). Start by pulling their GitHub data, then use what you find to search the web for their professional presence. Think out loud.`,
    tools: enrichmentTools,
    stopWhen: stepCountIs(25),
    abortSignal: request.signal,
    onStepFinish: async ({ toolCalls, toolResults }) => {
      for (const tc of toolCalls) {
        const tr = toolResults.find((r: any) => r.toolCallId === tc.toolCallId);
        await prisma.enrichmentLog.create({
          data: {
            candidateLogin: login,
            tool: tc.toolName,
            input: (tc as any).input ?? {},
            output: { result: typeof (tr as any)?.output === "string" ? (tr as any).output.slice(0, 2000) : "ok" },
            createdAt: new Date(),
          },
        }).catch(() => {});
      }
    },
  });

  const transformStream = new TransformStream({
    transform(chunk, controller) {
      switch (chunk.type) {
        case "text-delta":
          controller.enqueue(formatEvent({ type: "text", text: chunk.textDelta }));
          break;
        case "tool-call":
          controller.enqueue(formatEvent({
            type: "tool-call",
            toolName: chunk.toolName,
            args: JSON.stringify(chunk.args).slice(0, 200),
          }));
          break;
        case "tool-result":
          controller.enqueue(formatEvent({
            type: "tool-result",
            toolName: chunk.toolName,
            result: typeof chunk.result === "string" ? chunk.result.slice(0, 200) : JSON.stringify(chunk.result).slice(0, 200),
          }));
          break;
        case "finish":
          controller.enqueue(formatEvent({ type: "done" }));
          break;
      }
    },
  });

  return new Response(result.fullStream.pipeThrough(transformStream), {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ login: string }> }
) {
  const { login } = await params;

  const [logCount, repoCount, profileCount, linkedInCount, webCount] = await Promise.all([
    prisma.enrichmentLog.count({ where: { candidateLogin: login } }),
    prisma.repo.count({ where: { candidateLogin: login } }),
    prisma.profile.count({ where: { candidateLogin: login } }),
    prisma.linkedInProfile.count({ where: { candidateLogin: login } }),
    prisma.webMention.count({ where: { candidateLogin: login } }),
  ]);

  const recentLogs = await prisma.enrichmentLog.findMany({
    where: { candidateLogin: login },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { tool: true, error: true, durationMs: true, createdAt: true },
  });

  return NextResponse.json({
    login,
    enriched: repoCount > 0,
    analyzed: profileCount > 0,
    hasLinkedIn: linkedInCount > 0,
    webMentions: webCount,
    toolCalls: logCount,
    recentLogs,
  });
}

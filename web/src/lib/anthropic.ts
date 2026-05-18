import { createAnthropic } from "@ai-sdk/anthropic";
import { prisma } from "./prisma";

let cachedKey: string | null = null;
let cachedAt = 0;

async function resolveApiKey(): Promise<string | undefined> {
  if (Date.now() - cachedAt < 30_000 && cachedKey) return cachedKey;

  const setting = await prisma.setting.findUnique({ where: { key: "anthropic_api_key" } });
  if (setting?.value) {
    cachedKey = setting.value;
    cachedAt = Date.now();
    return setting.value;
  }

  return process.env.ANTHROPIC_API_KEY;
}

export async function getAnthropicProvider() {
  const apiKey = await resolveApiKey();
  return createAnthropic({ apiKey });
}

export { resolveApiKey as getAnthropicApiKey };

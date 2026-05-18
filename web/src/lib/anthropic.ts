import { createAnthropic } from "@ai-sdk/anthropic";
import { resolveKey } from "./api-keys";

export async function getAnthropicApiKey(): Promise<string | undefined> {
  return resolveKey("anthropic_api_key", "ANTHROPIC_API_KEY");
}

export async function getAnthropicProvider() {
  const apiKey = await getAnthropicApiKey();
  return createAnthropic({ apiKey });
}

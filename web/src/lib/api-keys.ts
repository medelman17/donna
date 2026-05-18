import { prisma } from "./prisma";

const cache = new Map<string, { value: string; at: number }>();
const TTL = 30_000;

export async function resolveKey(
  settingKey: string,
  envVar: string,
): Promise<string | undefined> {
  const cached = cache.get(settingKey);
  if (cached && Date.now() - cached.at < TTL) return cached.value;

  const setting = await prisma.setting.findUnique({ where: { key: settingKey } });
  if (setting?.value) {
    cache.set(settingKey, { value: setting.value, at: Date.now() });
    return setting.value;
  }

  return process.env[envVar];
}

export const getFirecrawlApiKey = () => resolveKey("firecrawl_api_key", "FIRECRAWL_API_KEY");
export const getBrowserbaseApiKey = () => resolveKey("browserbase_api_key", "BROWSERBASE_API_KEY");
export const getBrowserbaseProjectId = () => resolveKey("browserbase_project_id", "BROWSERBASE_PROJECT_ID");

import { tool } from "ai";
import { z } from "zod";

const linkedInSchema = z.object({
  profileUrl: z.string().nullable(),
  headline: z.string().nullable(),
  currentTitle: z.string().nullable(),
  currentCompany: z.string().nullable(),
  location: z.string().nullable(),
  connectionCount: z.number().nullable(),
  experience: z.array(z.object({
    title: z.string(),
    company: z.string(),
    duration: z.string().nullable(),
  })),
  education: z.array(z.object({
    school: z.string(),
    degree: z.string().nullable(),
    field: z.string().nullable(),
  })),
  skills: z.array(z.string()),
  certifications: z.array(z.string()),
  recentPosts: z.array(z.object({
    text: z.string().describe("Summary of the post content"),
    topic: z.string().nullable().describe("Topic category: legal-tech, coding, AI, career, other"),
  })).describe("Recent LinkedIn posts or activity visible on the profile"),
});

export const linkedinLookupTool = tool({
  description: "Find and extract a LinkedIn profile using a stealth browser. Returns structured profile data including experience, education, skills, and recent posts. Slow (~30-60s) but thorough.",
  inputSchema: z.object({
    name: z.string().describe("Person's full name"),
    company: z.string().optional().describe("Current or recent company"),
  }),
  execute: async ({ name, company }) => {
    const bbKey = process.env.BROWSERBASE_API_KEY;
    const bbProject = process.env.BROWSERBASE_PROJECT_ID;

    if (!bbKey || !bbProject) {
      return firecrawlFallback(name, company);
    }

    const searchTerms: string[] = [];
    if (name) searchTerms.push(`"${name}"`);
    if (company) searchTerms.push(`"${company}"`);
    const searchQuery = [...searchTerms, "site:linkedin.com/in"].join(" ");

    try {
      const { Stagehand } = await import("@browserbasehq/stagehand");

      const stagehand = new Stagehand({
        env: "BROWSERBASE",
        apiKey: bbKey,
        projectId: bbProject,
        model: {
          modelName: "anthropic/claude-sonnet-4-6",
          apiKey: process.env.ANTHROPIC_API_KEY,
        },
        verbose: 0,
      });

      try {
        await stagehand.init();

        const agent = stagehand.agent({
          model: "anthropic/claude-sonnet-4-6",
        });

        await agent.execute({
          instruction: [
            `Go to google.com and search for: ${searchQuery}`,
            `Click on the first LinkedIn profile result (a URL containing linkedin.com/in/).`,
            `Wait for the profile page to fully load.`,
          ].join("\n"),
          maxSteps: 8,
        });

        const profileData = await stagehand.extract(
          "Extract the LinkedIn profile data from this page: the profile URL from the address bar, " +
          "headline, current job title and company, location, number of connections, " +
          "work experience (title, company, duration for each role), " +
          "education (school, degree, field), listed skills, certifications, " +
          "and summaries of any recent posts or activity visible on the page.",
          linkedInSchema,
        );

        return JSON.stringify(profileData, null, 2);
      } finally {
        await stagehand.close().catch(() => {});
      }
    } catch (e: any) {
      console.error("[linkedin-lookup] Browserbase error:", e.message);
      return firecrawlFallback(name, company);
    }
  },
});

async function firecrawlFallback(name: string, company?: string): Promise<string> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) return "Error: neither BROWSERBASE nor FIRECRAWL configured";

  const query = `"${name}" ${company ? `"${company}"` : ""} site:linkedin.com/in`.trim();

  try {
    const res = await fetch("https://api.firecrawl.dev/v1/search", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, limit: 3 }),
    });

    if (!res.ok) return `LinkedIn search error: ${res.status}`;

    const json = await res.json();
    const results = json.data || [];
    if (results.length === 0) return "No LinkedIn profile found.";

    return results
      .map((r: any) => `${r.title || ""}\n${r.url || ""}\n${(r.description || "").slice(0, 300)}`)
      .join("\n\n");
  } catch (e: any) {
    return `LinkedIn lookup error: ${e.message}`;
  }
}

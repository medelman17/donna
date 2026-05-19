import { tool, generateText, stepCountIs } from "ai";
import { getAnthropicProvider } from "../anthropic";
import { z } from "zod";
import { ghQueryTool } from "./gh-query";
import { webSearchTool } from "./web-search";

const LEGAL_PROMPT = `You are a legal-tech industry analyst. Assess a developer's connection to the legal technology space. Be FAST — max 2 web searches.

Check: direct legal-tech work, employer in legal space, adjacent skills (NLP, compliance, gov-tech), why they forked an AI legal platform.

Rate: Deep / Adjacent / Transferable / None. Provide specific evidence.`;

export const legalAssessTool = tool({
  description: "Investigate a candidate's connection to the legal/legal-tech industry.",
  inputSchema: z.object({
    login: z.string().describe("GitHub username"),
    context: z.string().optional().describe("What you already know: name, company, bio"),
  }),
  execute: async ({ login, context }, { abortSignal }) => {
    const anthropic = await getAnthropicProvider();
    try {
      const { text } = await generateText({
        model: anthropic("claude-opus-4-7"),
        system: LEGAL_PROMPT,
        prompt: `Assess legal-tech relevance for '${login}'. Context: ${context || "none"}`,
        tools: { gh_query: ghQueryTool, web_search: webSearchTool },
        stopWhen: stepCountIs(15),
        abortSignal,
        providerOptions: {
          anthropic: { thinking: { type: "enabled", budgetTokens: 5000, effort: "high" } },
        },
      });
      return text || "Could not assess legal relevance.";
    } catch (e: any) {
      if (e.name === "AbortError") return "Assessment aborted.";
      return `Legal assessment error: ${e.message}`;
    }
  },
});

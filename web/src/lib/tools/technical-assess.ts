import { tool, generateText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { ghQueryTool } from "./gh-query";

const ASSESSOR_PROMPT = `You are a senior engineering technical assessor. Read actual code from the given repos and assess the developer's technical ability. Be FAST and FOCUSED — you have limited steps.

1. Get the file tree of ONE repo (the most interesting): gh_query endpoint="/repos/{owner}/{repo}/git/trees/HEAD?recursive=1" jq_filter=".tree[].path"
2. Read 2-3 key source files — entry points or core modules only
3. Check package.json/pyproject.toml for dependency choices

ASSESS: Code organization, framework choices, testing practices, engineering maturity (junior/mid/senior/staff). Be specific — cite files you read.`;

export const technicalAssessTool = tool({
  description: "Dispatch a subagent to read actual source code from repos and evaluate engineering ability. Use for interesting ORIGINAL (non-fork) repos.",
  inputSchema: z.object({
    login: z.string().describe("GitHub username"),
    repos: z.array(z.string()).describe("Repo names to assess (max 3)"),
  }),
  execute: async ({ login, repos }, { abortSignal }) => {
    const repoList = repos.slice(0, 3).map(r => `${login}/${r}`).join(", ");
    try {
      const { text } = await generateText({
        model: anthropic("claude-opus-4-6"),
        system: ASSESSOR_PROMPT,
        prompt: `Assess the technical ability of '${login}' by reading code from: ${repoList}`,
        tools: { gh_query: ghQueryTool },
        stopWhen: stepCountIs(8),
        abortSignal,
      });
      return text || "Assessment could not be completed.";
    } catch (e: any) {
      if (e.name === "AbortError") return "Assessment aborted.";
      return `Assessment error: ${e.message}`;
    }
  },
});

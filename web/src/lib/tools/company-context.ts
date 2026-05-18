import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const companyContextTool = tool({
  description: "Get the hiring company's description, open positions, and hiring preferences. Call this FIRST before planning your research — it tells you what the company does and what they're looking for, so you can tailor your investigation.",
  inputSchema: z.object({}),
  execute: async () => {
    const [settings, positions, preferences] = await Promise.all([
      prisma.setting.findMany({ where: { key: { in: ["company_description"] } } }),
      prisma.jobPosition.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.hiringPreference.findMany({ orderBy: { weight: "desc" } }),
    ]);

    const companyDesc = settings.find(s => s.key === "company_description")?.value;
    const sections: string[] = [];

    if (companyDesc) {
      sections.push(`## Company\n${companyDesc}`);
    }

    if (positions.length > 0) {
      sections.push(`## Open Positions (${positions.length})`);
      for (const p of positions) {
        sections.push(`### ${p.title}\n${p.description}`);
      }
    }

    if (preferences.length > 0) {
      const weightLabel = (w: number) => w >= 3 ? "HIGH" : w >= 2 ? "MEDIUM" : "LOW";
      sections.push(`## Hiring Preferences / Evaluation Tags`);
      sections.push(`Use these tags to evaluate candidates. Higher priority = more important signal.\n`);
      for (const p of preferences) {
        sections.push(`- **[${weightLabel(p.weight)}] ${p.tag}**: ${p.description}`);
      }
    }

    if (sections.length === 0) {
      return "No company context configured. The hiring team hasn't set up their company description or job listings yet.";
    }

    return sections.join("\n\n");
  },
});

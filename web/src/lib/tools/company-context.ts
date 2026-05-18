import { tool } from "ai";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const companyContextTool = tool({
  description: "Get the hiring company's description, job descriptions, and hiring preferences. Call this FIRST before planning your research — it tells you what the company does and what they're looking for, so you can tailor your investigation.",
  inputSchema: z.object({}),
  execute: async () => {
    const rows = await prisma.setting.findMany({
      where: {
        key: { in: ["company_description", "job_descriptions", "hiring_preferences"] },
      },
    });

    const settings: Record<string, string> = {};
    for (const r of rows) settings[r.key] = r.value;

    const sections: string[] = [];

    if (settings.company_description) {
      sections.push(`## Company\n${settings.company_description}`);
    }

    if (settings.job_descriptions) {
      sections.push(`## Open Positions\n${settings.job_descriptions}`);
    }

    if (settings.hiring_preferences) {
      sections.push(`## Hiring Preferences\n${settings.hiring_preferences}`);
    }

    if (sections.length === 0) {
      return "No company context configured. The hiring team hasn't set up their company description or job listings yet.";
    }

    return sections.join("\n\n");
  },
});

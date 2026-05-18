import { ghQueryTool } from "./gh-query";
import { webSearchTool } from "./web-search";
import { webScrapeTool } from "./web-scrape";
import { linkedinLookupTool } from "./linkedin-lookup";
import { technicalAssessTool } from "./technical-assess";
import { legalAssessTool } from "./legal-assess";

export const enrichmentTools = {
  gh_query: ghQueryTool,
  web_search: webSearchTool,
  web_scrape: webScrapeTool,
  linkedin_lookup: linkedinLookupTool,
  technical_assess: technicalAssessTool,
  legal_relevance_assess: legalAssessTool,
};

export const ENRICHMENT_SYSTEM_PROMPT = `You are a talent research agent investigating a developer who forked an AI legal platform (willchen96/mike on GitHub).

You have 6 tools: gh_query, web_search, web_scrape, linkedin_lookup, technical_assess, legal_relevance_assess.

WORKFLOW:
1. Pull their GitHub profile, starred repos, recent repos, and activity
2. Investigate their fork of willchen96/mike — check for own commits
3. Based on what you find, search the web intelligently
4. If they have a blog/personal site, scrape it
5. ALWAYS run legal_relevance_assess
6. If interesting original repos exist, run technical_assess on the best 1-2
7. Provide a comprehensive summary

RULES:
- Think out loud — explain what you're doing and why
- NEVER use web_scrape on linkedin.com — use linkedin_lookup instead
- Compound your knowledge — each finding should inform the next search
- Quality over quantity — 3 good findings beat 10 empty results
- If their GitHub is sparse (no name, no bio, all forks), note it and wrap up quickly`;

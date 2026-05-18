import { tool } from "ai";
import { z } from "zod";
import { cacheGet, cacheSet } from "@/lib/redis";

export const packageRegistryTool = tool({
  description: "Check if a developer publishes packages on npm or PyPI. Published packages show they build reusable tools and libraries, not just apps. Use for INVESTIGATE candidates with interesting repos.",
  inputSchema: z.object({
    login: z.string().describe("GitHub username (often matches npm/PyPI username)"),
    name: z.string().optional().describe("Full name for broader search"),
    knownPackages: z.array(z.string()).optional().describe("Package names found in their repos (from package.json name field, etc.)"),
  }),
  execute: async ({ login, name, knownPackages }) => {
    const sections: string[] = [];

    const npmResults = await searchNpm(login);
    if (npmResults) sections.push(npmResults);

    const pypiResults = await searchPypi(login);
    if (pypiResults) sections.push(pypiResults);

    if (knownPackages?.length) {
      const specific = await Promise.all(knownPackages.slice(0, 3).map(checkNpmPackage));
      const found = specific.filter(Boolean);
      if (found.length > 0) {
        sections.push("## Known Packages\n" + found.join("\n"));
      }
    }

    return sections.join("\n\n") || "No published packages found on npm or PyPI.";
  },
});

async function searchNpm(author: string): Promise<string | null> {
  const cached = await cacheGet("npm", author);
  if (cached) return cached;

  try {
    const res = await fetch(`https://registry.npmjs.org/-/v1/search?text=author:${encodeURIComponent(author)}&size=10`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const packages = data.objects ?? [];
    if (packages.length === 0) return null;

    const lines = packages.map((p: any) => {
      const pkg = p.package;
      const downloads = p.score?.detail?.popularity ? `popularity: ${Math.round(p.score.detail.popularity * 100)}%` : "";
      return `- **${pkg.name}** v${pkg.version}: ${pkg.description?.slice(0, 100) ?? "no description"} ${downloads}`;
    });

    const result = `## npm Packages by ${author}: ${packages.length} found\n${lines.join("\n")}`;
    await cacheSet("npm", author, result, 86400);
    return result;
  } catch {
    return null;
  }
}

async function searchPypi(author: string): Promise<string | null> {
  const cached = await cacheGet("pypi", author);
  if (cached) return cached;

  try {
    const res = await fetch(`https://pypi.org/simple/`, {
      headers: { Accept: "application/vnd.pypi.simple.v1+json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;

    const searchRes = await fetch(`https://pypi.org/search/?q=author:${encodeURIComponent(author)}&o=`, {
      signal: AbortSignal.timeout(10000),
    });
    if (!searchRes.ok) return null;

    const html = await searchRes.text();
    const matches = [...html.matchAll(/<a class="package-snippet" href="\/project\/([^/"]+)\/">/g)];
    if (matches.length === 0) return null;

    const packageNames = matches.slice(0, 5).map(m => m[1]);
    const details = await Promise.all(packageNames.map(async (name) => {
      try {
        const r = await fetch(`https://pypi.org/pypi/${name}/json`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return `- **${name}**`;
        const d = await r.json();
        return `- **${name}** v${d.info?.version ?? "?"}: ${d.info?.summary?.slice(0, 100) ?? "no description"}`;
      } catch {
        return `- **${name}**`;
      }
    }));

    const result = `## PyPI Packages by ${author}: ${packageNames.length} found\n${details.join("\n")}`;
    await cacheSet("pypi", author, result, 86400);
    return result;
  } catch {
    return null;
  }
}

async function checkNpmPackage(name: string): Promise<string | null> {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const latest = data["dist-tags"]?.latest;
    const desc = data.description?.slice(0, 100) ?? "";
    const author = data.author?.name ?? data.author ?? "";
    return `- **${name}** v${latest}: ${desc} (by ${author})`;
  } catch {
    return null;
  }
}

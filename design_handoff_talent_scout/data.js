// data.js - mock candidates for Talent Scout
// 50 deterministic candidates with realistic legal-AI/dev personas.

(function () {
  // ─── Seeded helpers ────────────────────────────────────────────────────────
  function hash(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  }
  function rng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 0x100000000;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];
  const int = (r, lo, hi) => Math.floor(r() * (hi - lo + 1)) + lo;
  const chance = (r, p) => r() < p;

  // ─── Source pools ─────────────────────────────────────────────────────────
  const FIRST = [
    "Maya", "Jonas", "Priya", "Wei", "Lukas", "Hana", "Diego", "Aarav",
    "Sofia", "Mateus", "Ines", "Yuki", "Noah", "Aisha", "Eitan", "Camille",
    "Daniel", "Liu", "Eva", "Idris", "Fatima", "Henrik", "Ravi", "Lena",
    "Tomás", "Anika", "Kenji", "Mira", "Oscar", "Sasha", "Aditya", "Yara",
    "Theo", "Beatrice", "Hiroshi", "Maja", "Andre", "Nadia", "Felix",
    "Cora", "Kofi", "Selin", "Ari", "Vera", "Omar", "Liv", "Ruslan",
    "Iris", "Caleb", "Nora",
  ];
  const LAST = [
    "Patel", "Larsen", "Singh", "Zhang", "Müller", "Kobayashi", "Reyes",
    "Sharma", "Almeida", "Costa", "Vidal", "Tanaka", "Bauer", "Ahmed",
    "Levi", "Dubois", "Schmidt", "Chen", "Novak", "Khan", "Hassan",
    "Andersen", "Iyer", "Holm", "Rossi", "Kapoor", "Watanabe", "Fischer",
    "Lindqvist", "Petrov", "Verma", "Mansour", "Becker", "Ferrari",
    "Yamada", "Kowalski", "Mendes", "Hossain", "Weber", "Marchetti",
    "Boateng", "Yıldız", "Gold", "Sokolov", "Kassem", "Berg", "Bondar",
    "Lind", "Ortiz", "Egan",
  ];
  const LOCS = [
    "Berlin, Germany", "New York, NY", "London, UK", "Tokyo, Japan",
    "Toronto, Canada", "Amsterdam, NL", "Bangalore, India", "São Paulo, BR",
    "Lisbon, Portugal", "Singapore", "Stockholm, Sweden", "Tel Aviv, Israel",
    "Paris, France", "Austin, TX", "San Francisco, CA", "Seattle, WA",
    "Zürich, CH", "Sydney, AU", "Mexico City, MX", "Warsaw, Poland",
    "Dublin, Ireland", "Cape Town, ZA", "Madrid, Spain", null, null,
  ];
  const COMPANIES = [
    "Stripe", "Vercel", "Replit", "@anthropic", "Linear", "Hugging Face",
    "Notion", "Datadog", "Mozilla", "Shopify", "Plaid", "@github",
    "Cloudflare", "Sentry", "Figma", "Spotify", "ElevenLabs", "@thomson-reuters",
    "Independent contractor", "Klarna", "DeepMind", "@openai", null, null, null,
  ];
  const LANGS = ["TypeScript", "Python", "Rust", "Go", "Elixir", "Java", "Kotlin", "Ruby", "Swift", "C++", "Scala"];
  const SKILL_POOL = [
    "TypeScript", "Python", "Rust", "Go", "React", "Next.js", "PostgreSQL",
    "LangChain", "LlamaIndex", "RAG", "OpenAI", "Anthropic", "Vector DBs",
    "pgvector", "FastAPI", "Django", "Node.js", "AWS", "GCP", "Kubernetes",
    "Docker", "ML Ops", "Fine-tuning", "Prompt Engineering", "GraphQL",
    "tRPC", "Drizzle", "Prisma", "Tailwind", "Supabase", "Legal Tech",
    "Contract Analysis", "eDiscovery", "Compliance", "Document AI", "OCR",
    "Tesseract", "spaCy", "Hugging Face", "DSPy", "Embeddings", "Postgres",
    "Redis", "BullMQ",
  ];
  const REPO_NAMES = [
    "contract-parser", "doc-rag", "legal-chunker", "case-citation-extractor",
    "judgement-summarizer", "redline-llm", "clause-similarity", "ediscovery-py",
    "mike-fork", "lawbot", "statute-graph", "policy-qa", "deposition-tagger",
    "nda-bot", "regtech-pipeline", "vector-search-demo", "rag-evals",
    "court-scraper", "legal-prompt-lib", "tribunal-search", "compliance-rules",
    "agent-tools", "llm-pipeline", "doc-classify", "redactor",
    "json-schema-tools", "tiny-evals", "openai-streaming", "claude-sdk-helpers",
    "kbd-overlay", "monorepo-template", "auth-recipe", "tracing-otel",
    "drizzle-utils", "trpc-zod", "swr-extras", "rust-tokenizer",
  ];
  const REPO_DESCS = [
    "Pull structured fields out of PDFs and DOCX contracts with high recall.",
    "Citation graph + retrieval over EU case law (DSPy + pgvector).",
    "Tiny lib: split long legal docs into semantically-coherent chunks.",
    "OSS toolkit for redlining contracts with frontier LLMs.",
    "Personal scratchpad while learning to ship LLM apps end-to-end.",
    "Production-ish pipeline I built for my last consulting gig.",
    "Evals harness for retrieval-heavy QA over private corpora.",
    "Reproduces the paper's results on long-context summarization.",
    "Just a fork I'm tinkering with — no promises.",
    null, null,
  ];
  const SUMMARIES = [
    "Senior backend engineer with deep document-pipeline experience; ran an internal eDiscovery tool at a mid-size firm before going independent.",
    "Mid-level full-stack dev, mostly TypeScript. Active in the RAG community on Twitter and has shipped two side-projects in the legal space.",
    "Staff-level systems engineer, ex-DeepMind. The fork is exploratory but the rest of their work suggests serious ML chops.",
    "Junior dev still finding their lane. Decent fundamentals, lots of forks, not much shipped on their own.",
    "Mid-senior contractor who explicitly lists 'LegalTech' on LinkedIn. Heavy Python + LangChain footprint and conference talks on agentic RAG.",
    "Senior fullstack with a Stripe pedigree. Fork is the only legal-tech signal but their writing on Substack covers contract automation.",
    "Mid-level Rust engineer drifting toward LLM tooling. Built a small but well-designed evals lib.",
    "Founder of a stealth legal-AI startup (per LinkedIn). Limited public code but the fork + blog suggest hands-on technical leadership.",
    "Generalist engineer at a large fintech. Bio mentions 'curious about LLMs'. Limited LegalTech signal.",
    "Long-time OSS contributor with a strong infra background. Recent activity centers on document pipelines.",
    "Self-taught engineer based in Lagos, two years experience. Energetic but probably too junior for the role we're sourcing for.",
    "PhD candidate in NLP whose recent work focuses on long-context summarization of legal documents. Strong academic signal.",
    "Mostly mobile-focused engineer — the fork looks like a one-off exploration, not aligned with our role.",
    "Principal-level dev with a long history of shipping LLM evals tooling. Speaks at conferences regularly.",
    "Mid-level engineer at a top legal-tech vendor. The fork is the strongest direct fit signal we've seen so far.",
  ];
  const FIT_REASONS = [
    "Three years of contract-extraction work, a recent talk on retrieval over case law, and a fork with their own commits adding clause classification. The strongest direct match in the cohort so far.",
    "Solid technical fundamentals but no specifically-legal-tech signal in their background. Could ramp, but isn't a slam-dunk fit.",
    "Heavy systems background with limited application-layer experience. Likely overqualified for a hands-on role and probably expensive.",
    "Energetic and clearly learning fast, but the body of work isn't there yet — 8 months of full-time experience.",
    "Their fork has their own commits implementing a custom prompt-eval harness. The rest of their stack (DSPy, pgvector, FastAPI) matches our target tech almost exactly.",
    "Worked at two regulated-industry startups. The fork is just a clone but their public talks cover the exact problem space.",
    "Has shipped consumer apps with LLMs at scale. Less obvious legal-domain experience, but the engineering fundamentals are clear.",
    "Outside our target geos and primarily a mobile engineer — would be a stretch.",
  ];
  const POS_SIG = [
    "Has own commits on the fork — implemented a citation-parsing layer.",
    "Conference talk at AI Engineer Summit '25 on retrieval over legal corpora.",
    "Two prior roles at regulated-industry startups (fintech, RegTech).",
    "Recently shipped a public RAG evals library with 1.2k stars.",
    "Bio explicitly mentions 'document understanding' and 'LLM ops'.",
    "Blog has 4 substantive posts on long-context summarization in the past 6 months.",
    "Owns the popular `doc-rag` repo with 800+ stars and active issues.",
    "Active on Hacker News with thoughtful threads on LLM evaluation.",
    "Lists 'eDiscovery' as a top skill on LinkedIn.",
    "Lives in our preferred timezone for the team they'd join.",
    "Mentioned as a contributor in two upstream legal-NLP papers.",
    "Has shipped production code with both Anthropic and OpenAI SDKs.",
  ];
  const NEG_SIG = [
    "Fork is a stale clone with no original commits — low signal.",
    "Has been at current employer 6 months — recently switched, probably not open.",
    "Primary language is Swift / mobile-focused — stack mismatch.",
    "Public output is mostly forks of other people's work, not original.",
    "LinkedIn shows a recent promotion at current company.",
    "No web presence beyond GitHub — hard to assess judgment.",
    "Self-describes as a 'student' — likely too junior for the role.",
    "GitHub account is less than a year old.",
  ];
  const NOTABLE_SIG = [
    "Has co-founder/CTO title on a small consultancy — may not be hireable but could be a partner.",
    "PhD candidate, finishing in 2026.",
    "Active on Mastodon legal-tech instance.",
    "Speaks at meetups in Berlin regularly.",
    "Lives in our preferred timezone (UTC+1 to UTC+3).",
    "Open to remote per LinkedIn 'Open to work' badge.",
    "Maintains a Substack with 2k subscribers on AI + law.",
  ];
  const LI_TITLES = [
    "Senior Software Engineer", "Staff Engineer", "Tech Lead, AI/ML",
    "Backend Engineer", "Founding Engineer", "Principal Engineer",
    "ML Engineer", "Full Stack Engineer", "Software Engineer II",
    "Engineering Manager", "Independent Consultant", "CTO & Co-founder",
  ];
  const LI_COMPANIES = [
    "Clio", "Harvey AI", "Lextegrity", "DocuSign", "Thomson Reuters",
    "Onit", "Spellbook", "Ironclad", "Evisort", "LawGeex", "Relativity",
    "Stripe", "Notion", "Linear", "Vercel", "Independent",
  ];
  const EVENT_TYPES = ["PushEvent", "PullRequestEvent", "IssuesEvent", "WatchEvent", "CreateEvent", "PushEvent", "PushEvent", "IssueCommentEvent"];
  const WEB_SOURCES = ["blog", "conference", "google", "github_mentions"];
  const WEB_TITLES = [
    "Building Document AI in Production — Notes from the Trenches",
    "Talk: Retrieval over Legal Corpora at AI Engineer Summit '25",
    "How we shipped our first LLM feature without losing our minds",
    "A pragmatic guide to RAG evals",
    "Why your LegalTech RAG demo doesn't survive contact with reality",
    "Notes on long-context summarization for case law",
    "From law firm to legal-AI startup: a year-end retrospective",
  ];
  const STATUSES = ["new", "reviewing", "interested", "contacted", "passed", "hired"];
  const SENIORITY = ["junior", "mid", "senior", "staff", "unknown"];

  // ─── Avatar palettes ──────────────────────────────────────────────────────
  // Deterministic, generated to avoid network dependencies.
  const AV_BG = [
    "#7c6df2", "#ea8f6b", "#5c8fce", "#7aa86a", "#c66a8a", "#d8b25c",
    "#5fa0a0", "#a37bd9", "#d0775c", "#6c8eb0", "#9a8d62", "#69a08e",
  ];

  // ─── Build candidates ─────────────────────────────────────────────────────
  function buildOne(i, opts) {
    const r = rng(opts.seed);
    const first = pick(r, FIRST);
    const last = pick(r, LAST);
    const name = first + " " + last;
    const login = (first + last).toLowerCase().replace(/[^a-z]/g, "") +
      (chance(r, 0.3) ? "" : String(int(r, 0, 99)));
    const loc = pick(r, LOCS);
    const company = pick(r, COMPANIES);
    const followers = chance(r, 0.15) ? int(r, 800, 12000) : int(r, 4, 600);
    const publicRepos = int(r, 6, 180);
    const seniority = opts.seniority || pick(r, SENIORITY);
    const fitScore = opts.fitScore || (chance(r, 0.2) ? 5 : chance(r, 0.3) ? 4 : chance(r, 0.3) ? 3 : chance(r, 0.15) ? 2 : 1);
    const hasOwnCommits = chance(r, fitScore >= 4 ? 0.85 : fitScore === 3 ? 0.5 : 0.2);
    const aheadBy = hasOwnCommits ? int(r, 1, 24) : 0;
    const behindBy = int(r, 0, 38);
    const accountAgeYears = int(r, 1, 12);
    const githubCreatedAt = new Date(2026 - accountAgeYears, int(r, 0, 11), int(r, 1, 27));

    // repos
    const repoCount = int(r, 3, 7);
    const repos = [];
    for (let j = 0; j < repoCount; j++) {
      const lang = pick(r, LANGS);
      repos.push({
        name: pick(r, REPO_NAMES) + (chance(r, 0.3) ? "-" + int(r, 1, 9) : ""),
        language: lang,
        stars: chance(r, 0.2) ? int(r, 100, 2400) : int(r, 0, 80),
        forks: int(r, 0, 60),
        description: pick(r, REPO_DESCS),
        isFork: chance(r, 0.25),
        pushedAt: daysAgo(r, int(r, 1, 380)),
      });
    }
    repos.sort((a, b) => b.stars - a.stars);

    // events
    const eventCount = int(r, 6, 20);
    const events = [];
    for (let j = 0; j < eventCount; j++) {
      events.push({
        type: pick(r, EVENT_TYPES),
        repoName: (chance(r, 0.5) ? login + "/" : pick(r, ["openai/", "anthropic/", "vercel/", "facebook/", "willchen96/", "langchain/"])) + pick(r, REPO_NAMES),
        createdAt: daysAgo(r, j * int(r, 1, 5)),
      });
    }
    events.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    // top languages
    const topLangs = Array.from(new Set(repos.map(x => x.language))).slice(0, 4);

    // skills
    const skillSet = new Set();
    topLangs.forEach(l => skillSet.add(l));
    const skillCount = int(r, 5, 11);
    while (skillSet.size < skillCount) skillSet.add(pick(r, SKILL_POOL));
    const skills = Array.from(skillSet);

    // signals
    const signals = [];
    const posCount = fitScore >= 4 ? int(r, 2, 4) : fitScore === 3 ? int(r, 1, 3) : int(r, 0, 1);
    const negCount = fitScore <= 2 ? int(r, 2, 3) : fitScore === 3 ? int(r, 0, 2) : int(r, 0, 1);
    const notCount = int(r, 0, 2);
    const usedPos = new Set(), usedNeg = new Set(), usedNot = new Set();
    for (let j = 0; j < posCount; j++) {
      let s;
      do { s = pick(r, POS_SIG); } while (usedPos.has(s));
      usedPos.add(s);
      signals.push({ kind: "positive", text: s });
    }
    for (let j = 0; j < negCount; j++) {
      let s;
      do { s = pick(r, NEG_SIG); } while (usedNeg.has(s));
      usedNeg.add(s);
      signals.push({ kind: "negative", text: s });
    }
    for (let j = 0; j < notCount; j++) {
      let s;
      do { s = pick(r, NOTABLE_SIG); } while (usedNot.has(s));
      usedNot.add(s);
      signals.push({ kind: "notable", text: s });
    }

    // LinkedIn (70% have it)
    let linkedin = null;
    if (chance(r, 0.72)) {
      const roleCount = int(r, 2, 5);
      const experience = [];
      let endYear = 2026;
      for (let j = 0; j < roleCount; j++) {
        const yrs = int(r, 1, 4);
        const startYear = endYear - yrs;
        experience.push({
          title: pick(r, LI_TITLES),
          company: pick(r, LI_COMPANIES),
          start: startYear,
          end: j === 0 ? "Present" : endYear,
          months: yrs * 12,
          description: chance(r, 0.5) ? "Led document-pipeline work for the platform team; built the eDiscovery export feature end-to-end." : null,
        });
        endYear = startYear;
      }
      linkedin = {
        headline: experience[0].title + " · ex-" + (experience[1] ? experience[1].company : "OSS"),
        currentTitle: experience[0].title,
        currentCompany: experience[0].company,
        url: "https://www.linkedin.com/in/" + login,
        connections: chance(r, 0.5) ? "500+" : String(int(r, 80, 480)),
        experience,
        education: chance(r, 0.6) ? [{
          school: pick(r, ["TU Berlin", "MIT", "Stanford", "ETH Zürich", "University of Oxford", "Carnegie Mellon", "University of Toronto", "IIT Bombay", "NYU", "TU München"]),
          degree: pick(r, ["BSc Computer Science", "MSc Computer Science", "PhD Natural Language Processing", "BEng Software Engineering"]),
          years: int(r, 2014, 2022) + "–" + int(r, 2018, 2025),
        }] : [],
        skills: skills.slice(0, int(r, 4, 8)),
      };
    }

    // web mentions (0–5)
    const webCount = chance(r, 0.6) ? int(r, 1, 5) : 0;
    const web = [];
    for (let j = 0; j < webCount; j++) {
      web.push({
        title: pick(r, WEB_TITLES),
        source: pick(r, WEB_SOURCES),
        url: "https://example.com/" + login + "/" + j,
        snippet: "…showed that the bottleneck wasn't the model but the retrieval pipeline. Specifically, our chunking strategy was throwing away 30% of recall before the LLM ever saw the documents…",
      });
    }

    // profile / summary / outreach
    const summary = pick(r, SUMMARIES);
    const fitReasoning = pick(r, FIT_REASONS);
    const recommendedOutreach = fitScore >= 4 ? "yes" : fitScore === 3 ? "maybe" : "no";
    const outreachReason = recommendedOutreach === "yes"
      ? "Strong domain fit and the fork shows real engagement — worth a personalized intro this week."
      : recommendedOutreach === "maybe"
      ? "Worth a soft touch — their adjacent experience could ramp quickly if they're open."
      : "Not aligned for this role; revisit if our requirements shift toward more generalist backend.";
    const confidence = +(0.4 + r() * 0.55).toFixed(2);

    // CRM
    const status = opts.status || (chance(r, 0.75) ? "new"
      : pick(r, ["reviewing", "reviewing", "interested", "contacted", "passed"]));
    const tags = chance(r, 0.4) ? pick(r, [
      ["q2-batch"], ["q2-batch", "warm-intro"], ["referral"], ["passed-2024"],
      ["eu-only"], ["high-priority"], ["watch"],
    ]) : [];
    const notes = chance(r, 0.25) ? pick(r, [
      "Reached out via twitter DM — no response yet.",
      "Sarah said she met them at the AI Engineer Summit; positive impression.",
      "Already in our ATS from last cycle — declined for comp reasons.",
      "Could be a good RFI candidate but probably not full-time.",
    ]) : "";

    return {
      login, name, location: loc, company,
      bio: chance(r, 0.7) ? pick(r, [
        "Building tools for lawyers. Previously @stripe and @plaid.",
        "Backend, distributed systems, occasional LLM tinkering.",
        "Independent consultant — RAG pipelines and document AI.",
        "Engineer. Writing about LLM evals at " + (chance(r, 0.5) ? "substack.com" : "my blog") + ".",
        "PhD candidate · NLP & retrieval over long documents.",
        "Just trying to ship things that don't break.",
      ]) : "",
      blog: chance(r, 0.4) ? "https://" + login + ".dev" : null,
      twitter: chance(r, 0.5) ? login : null,
      avatarBg: AV_BG[i % AV_BG.length],
      avatarInit: (first[0] + last[0]).toUpperCase(),
      avatarUrl: null,
      followers, publicRepos,
      githubCreatedAt: githubCreatedAt.toISOString(),
      htmlUrl: "https://github.com/" + login,
      forkMeta: {
        forkHtmlUrl: "https://github.com/" + login + "/mike",
        forkPushedAt: daysAgo(r, int(r, 3, 220)),
        aheadBy, behindBy, hasOwnCommits,
      },
      repos, events,
      topLanguages: topLangs,
      profile: {
        summary, seniority, fitScore, fitReasoning,
        recommendedOutreach, outreachReason, confidence,
        model: "claude-opus-4-7",
        generatedAt: daysAgo(r, int(r, 1, 30)),
      },
      signals,
      skills,
      linkedin,
      web,
      crm: { status, notes, tags },
    };
  }

  function daysAgo(r, d) {
    const t = Date.now() - d * 24 * 3600 * 1000 - int(r, 0, 23) * 3600 * 1000;
    return new Date(t).toISOString();
  }

  // Build 50 candidates with curated top picks at the top of the cohort
  const curated = [
    { seed: 11, fitScore: 5, seniority: "senior", status: "reviewing" },
    { seed: 27, fitScore: 5, seniority: "staff", status: "interested" },
    { seed: 41, fitScore: 5, seniority: "senior", status: "contacted" },
    { seed: 52, fitScore: 5, seniority: "senior", status: "new" },
    { seed: 63, fitScore: 4, seniority: "senior", status: "reviewing" },
    { seed: 78, fitScore: 4, seniority: "mid", status: "new" },
    { seed: 84, fitScore: 4, seniority: "senior", status: "interested" },
    { seed: 95, fitScore: 4, seniority: "staff", status: "new" },
    { seed: 108, fitScore: 3, seniority: "mid", status: "new" },
    { seed: 119, fitScore: 3, seniority: "mid", status: "reviewing" },
    { seed: 124, fitScore: 3, seniority: "senior", status: "passed" },
    { seed: 138, fitScore: 3, seniority: "mid", status: "new" },
    { seed: 142, fitScore: 2, seniority: "junior", status: "passed" },
    { seed: 159, fitScore: 1, seniority: "unknown", status: "new" },
  ];
  const all = [];
  for (let i = 0; i < curated.length; i++) all.push(buildOne(i, curated[i]));
  for (let i = 0; i < 50 - curated.length; i++) {
    all.push(buildOne(curated.length + i,
      { seed: 200 + i * 7, fitScore: null, seniority: null, status: null }));
  }

  // Sort by fit score desc by default
  all.sort((a, b) => (b.profile.fitScore - a.profile.fitScore) || (b.followers - a.followers));

  window.CANDIDATES = all;
})();

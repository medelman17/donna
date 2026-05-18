import { defineCatalog } from "@json-render/core";
import { schema } from "@json-render/react";
import { z } from "zod";

export const enrichCatalog = defineCatalog(schema, {
  components: {
    Stack: {
      props: z.object({
        gap: z.number().nullable(),
      }),
      slots: ["default"],
      description:
        "Vertical container that renders children in a column. Use as the root layout element.",
    },
    ReasoningCard: {
      props: z.object({
        title: z.string(),
        step: z.number().nullable(),
      }),
      description:
        "Agent reasoning or analysis step. Use to explain what you are doing and why. Title is the reasoning text.",
    },
    ToolCallRow: {
      props: z.object({
        tool: z.string(),
        detail: z.string(),
        status: z.enum(["success", "error", "running"]),
      }),
      description:
        "Compact single-line tool call indicator. Show after each tool call completes. Tool is the tool name, detail is a short summary of what was queried.",
    },
    MetricGrid: {
      props: z.object({
        metrics: z.array(
          z.object({
            label: z.string(),
            value: z.string(),
            sub: z.string().nullable(),
          })
        ),
      }),
      description:
        "Grid of key-value metrics. Use for stats like followers, repos, stars, contributions.",
    },
    SignalCard: {
      props: z.object({
        kind: z.enum(["positive", "negative", "notable"]),
        text: z.string(),
      }),
      description:
        "A signal or finding. Positive = green, negative = red, notable = blue. Text describes the finding.",
    },
    SubagentSection: {
      props: z.object({
        name: z.string(),
        summary: z.string(),
      }),
      slots: ["default"],
      description:
        "Collapsible section for subagent results (technical assessment, legal relevance). Name is the subagent title, summary is a brief result. Children contain detail elements.",
    },
    SummaryCard: {
      props: z.object({
        rating: z.enum(["Deep", "Adjacent", "Transferable", "None"]),
        headline: z.string(),
        body: z.string(),
      }),
      description:
        "Final enrichment assessment. Rating indicates fit level. Headline is the one-line verdict. Body is the detailed summary paragraph.",
    },
    ProfileHeader: {
      props: z.object({
        name: z.string().nullable(),
        login: z.string(),
        avatar: z.string().nullable(),
        bio: z.string().nullable(),
        location: z.string().nullable(),
        company: z.string().nullable(),
      }),
      description:
        "Candidate identity header showing name, GitHub login, avatar, bio, location, and company.",
    },
    RepoCard: {
      props: z.object({
        name: z.string(),
        language: z.string().nullable(),
        stars: z.number().nullable(),
        description: z.string().nullable(),
        url: z.string().nullable(),
      }),
      description:
        "Repository finding card. Shows a notable repo with language, stars, and description.",
    },
    LinkedInCard: {
      props: z.object({
        headline: z.string().nullable(),
        title: z.string().nullable(),
        company: z.string().nullable(),
        summary: z.string().nullable(),
      }),
      description:
        "LinkedIn profile data card showing headline, current title, company, and summary.",
    },
    WebMentionCard: {
      props: z.object({
        source: z.string(),
        title: z.string(),
        snippet: z.string(),
      }),
      description:
        "Web finding card showing source name, page title, and a text snippet.",
    },
    Badge: {
      props: z.object({
        text: z.string(),
        variant: z.enum(["green", "red", "blue", "gray"]),
      }),
      description: "Inline status tag or label.",
    },
    Divider: {
      props: z.object({
        label: z.string().nullable(),
      }),
      description: "Horizontal rule separator with optional centered label.",
    },
  },
  actions: {},
});

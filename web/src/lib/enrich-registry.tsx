import { defineRegistry } from "@json-render/react";
import { enrichCatalog } from "./enrich-catalog";

export const { registry: enrichRegistry } = defineRegistry(enrichCatalog, {
  components: {
    Stack: ({ props, children }) => (
      <div style={{ display: "flex", flexDirection: "column", gap: props.gap ?? 10 }}>
        {children}
      </div>
    ),

    ReasoningCard: ({ props }) => (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: props.step != null ? "28px 1fr" : "1fr",
          gap: 10,
          padding: "10px 14px",
          fontSize: 13,
          lineHeight: 1.55,
          color: "var(--color-fg-muted)",
          borderLeft: "2px solid var(--color-accent)",
          background:
            "linear-gradient(90deg, color-mix(in oklab, var(--color-accent), transparent 94%), transparent 80%)",
          borderRadius: "0 var(--radius-sm) var(--radius-sm) 0",
        }}
      >
        {props.step != null && (
          <span
            style={{
              width: 28,
              height: 28,
              borderRadius: 4,
              background: "var(--color-accent)",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontSize: 12,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            {props.step}
          </span>
        )}
        <span style={{ textWrap: "pretty" as any }}>{props.title}</span>
      </div>
    ),

    ToolCallRow: ({ props }) => {
      const color =
        props.status === "success"
          ? "#16a34a"
          : props.status === "error"
          ? "#dc2626"
          : "var(--color-accent)";
      const icon =
        props.status === "success" ? "✓" : props.status === "error" ? "✗" : "●";
      return (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "3px 14px",
            fontSize: 11.5,
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            color: "var(--color-fg-muted)",
          }}
        >
          <span style={{ color, flexShrink: 0, fontWeight: 600 }}>{icon}</span>
          <span
            style={{
              display: "inline-flex",
              padding: "1px 6px",
              borderRadius: 3,
              background: "var(--color-bg-2)",
              color: "var(--color-fg-muted)",
              fontSize: 10.5,
              fontWeight: 500,
              fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
              whiteSpace: "nowrap",
            }}
          >
            {props.tool}
          </span>
          <span
            style={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            {props.detail}
          </span>
        </div>
      );
    },

    MetricGrid: ({ props }) => (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
          gap: 6,
        }}
      >
        {props.metrics.map((m, i) => (
          <div
            key={i}
            style={{
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-DEFAULT)",
              padding: "8px 10px",
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                color: "var(--color-fg-subtle)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontWeight: 600,
              }}
            >
              {m.label}
            </div>
            <div
              style={{
                fontSize: 15,
                color: "var(--color-fg)",
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                marginTop: 1,
              }}
            >
              {m.value}
            </div>
            {m.sub && (
              <div style={{ fontSize: 11, color: "var(--color-fg-muted)" }}>{m.sub}</div>
            )}
          </div>
        ))}
      </div>
    ),

    SignalCard: ({ props }) => {
      const cfg = {
        positive: { bg: "#16a34a", borderMix: "color-mix(in oklab, #16a34a, transparent 70%)", bgMix: "color-mix(in oklab, #16a34a, transparent 95%)", icon: "+" },
        negative: { bg: "#dc2626", borderMix: "color-mix(in oklab, #dc2626, transparent 70%)", bgMix: "color-mix(in oklab, #dc2626, transparent 96%)", icon: "−" },
        notable: { bg: "#2563eb", borderMix: "color-mix(in oklab, #2563eb, transparent 70%)", bgMix: "color-mix(in oklab, #2563eb, transparent 96%)", icon: "!" },
      };
      const c = cfg[props.kind];
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "14px 1fr",
            gap: 8,
            padding: "8px 10px",
            border: `1px solid ${c.borderMix}`,
            borderRadius: "var(--radius-DEFAULT)",
            background: c.bgMix,
            fontSize: 12.5,
            lineHeight: 1.45,
            alignItems: "start",
          }}
        >
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontSize: 10,
              color: "#fff",
              fontWeight: 700,
              marginTop: 2,
              background: c.bg,
            }}
          >
            {c.icon}
          </span>
          <span style={{ color: "var(--color-fg)", textWrap: "pretty" as any }}>{props.text}</span>
        </div>
      );
    },

    SubagentSection: ({ props, children }) => (
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        <details open>
          <summary
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 14px",
              background:
                "linear-gradient(180deg, color-mix(in oklab, var(--color-accent), transparent 92%), transparent)",
              borderBottom: "1px solid var(--color-border)",
              cursor: "pointer",
              userSelect: "none",
              fontSize: 12.5,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: 3,
                background: "var(--color-accent)",
                color: "#fff",
                display: "grid",
                placeItems: "center",
                fontWeight: 700,
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              A
            </span>
            <span style={{ fontWeight: 500, color: "var(--color-fg)" }}>{props.name}</span>
            <span
              style={{
                marginLeft: "auto",
                fontSize: 11.5,
                color: "var(--color-fg-subtle)",
              }}
            >
              {props.summary}
            </span>
          </summary>
          <div style={{ padding: "14px 16px" }}>{children}</div>
        </details>
      </div>
    ),

    SummaryCard: ({ props }) => {
      const ratingCfg: Record<string, { bg: string; fg: string; border?: string }> = {
        Deep: { bg: "#c7ecd2", fg: "#0f6b32", border: "#9ad7af" },
        Adjacent: { bg: "#dfeaff", fg: "#2d5cb1" },
        Transferable: { bg: "#fbecd6", fg: "#8a6a1f" },
        None: { bg: "#eceff3", fg: "#5c6473" },
      };
      const rc = ratingCfg[props.rating] ?? ratingCfg.None;
      return (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "88px 1fr",
            gap: 22,
            background: "var(--color-bg-2)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-lg)",
            padding: "16px 18px",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 6,
            }}
          >
            <div
              style={{
                fontSize: 10.5,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
                color: "var(--color-fg-subtle)",
                fontWeight: 600,
              }}
            >
              Fit
            </div>
            <div
              style={{
                display: "inline-grid",
                placeItems: "center",
                padding: "4px 12px",
                borderRadius: "var(--radius-DEFAULT)",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "-0.02em",
                background: rc.bg,
                color: rc.fg,
                border: rc.border ? `1px solid ${rc.border}` : "none",
              }}
            >
              {props.rating}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-fg)",
                letterSpacing: "-0.012em",
                marginBottom: 6,
              }}
            >
              {props.headline}
            </div>
            <div
              style={{
                fontSize: 12.5,
                lineHeight: 1.55,
                color: "var(--color-fg-muted)",
                textWrap: "pretty" as any,
              }}
            >
              {props.body}
            </div>
          </div>
        </div>
      );
    },

    ProfileHeader: ({ props }) => (
      <div
        style={{
          display: "flex",
          gap: 18,
          alignItems: "flex-start",
          paddingBottom: 14,
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {props.avatar && (
          <img
            src={props.avatar}
            alt=""
            style={{
              width: 52,
              height: 52,
              borderRadius: "50%",
              flexShrink: 0,
            }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              flexWrap: "wrap",
              marginBottom: 4,
            }}
          >
            <span
              style={{
                fontSize: 22,
                fontWeight: 600,
                letterSpacing: "-0.012em",
                color: "var(--color-fg)",
              }}
            >
              {props.name ?? props.login}
            </span>
            {props.name && (
              <span style={{ color: "var(--color-fg-subtle)", fontSize: 14 }}>
                @{props.login}
              </span>
            )}
          </div>
          {props.bio && (
            <div
              style={{
                color: "var(--color-fg-muted)",
                margin: "4px 0 10px",
                maxWidth: 620,
                textWrap: "pretty" as any,
              }}
            >
              {props.bio}
            </div>
          )}
          {(props.location || props.company) && (
            <div
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                color: "var(--color-fg-subtle)",
                fontSize: 12,
                alignItems: "center",
              }}
            >
              {props.company && <span>{props.company}</span>}
              {props.company && props.location && (
                <span style={{ color: "var(--color-border-strong)" }}>·</span>
              )}
              {props.location && <span>{props.location}</span>}
            </div>
          )}
        </div>
      </div>
    ),

    RepoCard: ({ props }) => (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: 14,
          padding: "10px 12px",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-DEFAULT)",
        }}
      >
        <div>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              color: "var(--color-accent)",
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            {props.name}
          </span>
          {props.description && (
            <div
              style={{
                color: "var(--color-fg-muted)",
                fontSize: 12.5,
                marginTop: 3,
                textWrap: "pretty" as any,
              }}
            >
              {props.description}
            </div>
          )}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            color: "var(--color-fg-subtle)",
            fontSize: 11.5,
            fontVariantNumeric: "tabular-nums",
            whiteSpace: "nowrap",
          }}
        >
          {props.language && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: langColor(props.language),
                }}
              />
              {props.language}
            </span>
          )}
          {props.stars != null && props.stars > 0 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              ★ {props.stars}
            </span>
          )}
        </div>
      </div>
    ),

    LinkedInCard: ({ props }) => (
      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-lg)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 14px",
            background:
              "linear-gradient(180deg, color-mix(in oklab, #0a66c2, transparent 92%), transparent)",
            borderBottom: "1px solid var(--color-border)",
          }}
        >
          <span
            style={{
              width: 18,
              height: 18,
              borderRadius: 3,
              background: "#0a66c2",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 11,
            }}
          >
            in
          </span>
          <span style={{ color: "var(--color-fg)", fontWeight: 500 }}>
            {props.headline ?? "LinkedIn Profile"}
          </span>
        </div>
        <div style={{ padding: "14px 16px" }}>
          {(props.title || props.company) && (
            <div style={{ marginBottom: 8 }}>
              {props.title && (
                <div style={{ color: "var(--color-fg)", fontWeight: 500, fontSize: 13 }}>
                  {props.title}
                </div>
              )}
              {props.company && (
                <div style={{ color: "var(--color-fg-muted)", fontSize: 12 }}>
                  {props.company}
                </div>
              )}
            </div>
          )}
          {props.summary && (
            <div
              style={{
                color: "var(--color-fg-muted)",
                fontSize: 12,
                lineHeight: 1.45,
                textWrap: "pretty" as any,
              }}
            >
              {props.summary}
            </div>
          )}
        </div>
      </div>
    ),

    WebMentionCard: ({ props }) => (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px 1fr",
          gap: 12,
          padding: "10px 12px",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-DEFAULT)",
        }}
      >
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            color: "var(--color-fg-subtle)",
            alignSelf: "flex-start",
            paddingTop: 1,
          }}
        >
          {props.source}
        </span>
        <div>
          <div
            style={{
              color: "var(--color-fg)",
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            {props.title}
          </div>
          <div
            style={{
              color: "var(--color-fg-muted)",
              fontSize: 12,
              marginTop: 4,
              lineHeight: 1.45,
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical" as any,
              overflow: "hidden",
            }}
          >
            {props.snippet}
          </div>
        </div>
      </div>
    ),

    Badge: ({ props }) => {
      const cfg = {
        green: { bg: "#dff5e6", fg: "#1f7a3e", dot: "#16a34a" },
        red: { bg: "#fef2f2", fg: "#991b1b", dot: "#dc2626" },
        blue: { bg: "#e6f1ff", fg: "#245aa6", dot: "#3b82f6" },
        gray: { bg: "#f1f2f6", fg: "#4a5060", dot: "#8a8e9d" },
      };
      const c = cfg[props.variant];
      return (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "1px 7px",
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 500,
            whiteSpace: "nowrap",
            background: c.bg,
            color: c.fg,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: c.dot,
            }}
          />
          {props.text}
        </span>
      );
    },

    Divider: ({ props }) => (
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--color-border)",
          paddingBottom: 6,
          marginTop: 8,
        }}
      >
        {props.label ? (
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              color: "var(--color-fg-muted)",
            }}
          >
            {props.label}
          </span>
        ) : (
          <span />
        )}
      </div>
    ),
  },
});

function langColor(lang: string): string {
  const colors: Record<string, string> = {
    TypeScript: "#3178c6",
    JavaScript: "#f1e05a",
    Python: "#3572A5",
    Rust: "#dea584",
    Go: "#00ADD8",
    Java: "#b07219",
    Kotlin: "#A97BFF",
    Ruby: "#701516",
    Swift: "#F05138",
    "C++": "#f34b7d",
    Scala: "#c22d40",
    Elixir: "#6e4a7e",
  };
  return colors[lang] ?? "var(--color-fg-subtle)";
}

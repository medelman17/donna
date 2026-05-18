# Research: Motion Animations for Next.js 16 Streaming UIs

**Date:** 2026-05-18
**Query:** How to add motion (framer-motion v12+) animations to a Next.js 16 App Router streaming UI with React 19 and Tailwind v4, where content blocks append in real time via SSE.
**Depth:** Deep

---

## Summary

`motion` (the rebranded framer-motion, v12+) is the right choice for this stack. It has full React 19 / concurrent-mode support, SSR-safe rendering via `motion/react-client`, and a hybrid engine that offloads compositor-safe properties (`opacity`, `transform`) to the browser's native animation pipeline — bypassing React's render cycle entirely. For an append-only list, use `AnimatePresence initial={false}` with stable string keys (never array indices). Wrap state updates that drive block appends in `startTransition` to keep the UI thread responsive during 100ms streaming pulses. For simple enter effects, Tailwind v4's `starting:` variant is a compelling zero-JS alternative.

---

## Key Findings

### 1. motion vs. Alternatives

| Library | Bundle (gzip) | React 19 | Streaming perf | Best for |
|---|---|---|---|---|
| **motion/react** | ~34 KB full, ~4.6 KB with LazyMotion+`m` | Yes | Good (bypasses React render cycle for running animations) | Rich, interruptible, spring-based animations |
| **@formkit/auto-animate** | ~2 KB | Yes | Excellent (one ref, zero config) | Append/remove/reorder lists with no fine-grained control needed |
| **CSS `@starting-style`** | 0 KB | N/A | Best (native, no JS) | Simple enter fade/slide, browser support 90%+ (Chrome 117+, FF 129+, Safari 17.5+) |
| **react-spring** | ~20 KB | Yes | Good | Physics-based interactions |
| **GSAP** | ~15 KB | Yes | Excellent | Complex timelines |

**For this project:** Motion is the best balance. The streaming feed needs per-block enter animations with precise timing control (different transitions for text vs. cards vs. tool indicators). Auto-animate cannot distinguish between block types. CSS `@starting-style` cannot trigger on React state-driven appends (only on first DOM insertion, which is what we want — more on this below).

**Verdict:** Install `motion`. Use `LazyMotion` + `m` component to keep the client bundle near 4.6 KB.

---

### 2. AnimatePresence with Append-Only Lists

`AnimatePresence` is designed primarily for *exit* animations. For an append-only list (no removes, no reorders during streaming), you can use it purely for enter animations — but it's optional. The simpler pattern is animating `motion.div` children directly without `AnimatePresence`, since nothing ever leaves the DOM during streaming.

**Critical rule:** never use array index as key. Index keys cause AnimatePresence to mis-identify "new" items when the array shifts. Use a stable string key derived from block content or position:

```tsx
// Bad — index key means block 0 is always "block 0", no animation on new prepends
blocks.map((block, i) => <motion.div key={i} ...>)

// Good — stable key based on position at creation time
blocks.map((block, i) => <motion.div key={`block-${i}`} ...>)
// Or better: assign a UUID when pushing to blocksRef
blocks.map((block) => <motion.div key={block.id} ...>)
```

**Does AnimatePresence cause re-renders of existing items?**
No. `AnimatePresence` subscribes to its children's keys. When a new child is added, React re-renders the parent (because `blocks` state changed), but motion components for *existing* blocks compare their `animate` prop and skip DOM updates if nothing changed. Running animations are managed outside the React tree in the browser's animation pipeline.

**When to use AnimatePresence in this case:**
Only if you want the thinking indicator to animate *out* (exit animation) before disappearing. For enter-only effects, skip `AnimatePresence` — it adds overhead.

---

### 3. Enter Animations — Fade + Slide, Blocking Initial Render

The core pattern:

```tsx
<motion.div
  initial={{ opacity: 0, y: 12 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.25, ease: "easeOut" }}
>
  {/* block content */}
</motion.div>
```

**The problem:** On the first render (e.g., when a saved enrichment loads from the DB and all blocks exist at once), every block will animate in sequentially — jarring and slow.

**Solution A — `AnimatePresence initial={false}` on the container:**

```tsx
<AnimatePresence initial={false}>
  {blocks.map((block) => (
    <motion.div
      key={block.id}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      ...
    </motion.div>
  ))}
</AnimatePresence>
```

`initial={false}` on `AnimatePresence` suppresses the `initial` state for all motion children that are present on the *first render*. Only blocks added *after* mount animate in. This is the exact behavior we need.

**Caveat:** `initial={false}` on `AnimatePresence` propagates down the entire subtree — it disables `initial` on nested motion components too. If you have nested motion elements inside a card component, be aware of this.

**Solution B — Track whether the component has already mounted:**

```tsx
const hasMounted = useRef(false);
useEffect(() => { hasMounted.current = true; }, []);

// In render:
initial={hasMounted.current ? { opacity: 0, y: 12 } : false}
```

This is more explicit but adds ref overhead per-block. Solution A is cleaner.

---

### 4. Performance with Rapid State Updates (100ms intervals)

**Motion's architecture:** Once an animation starts, motion bypasses React's reconciler entirely — it uses `requestAnimationFrame` or the Web Animations API to update DOM styles directly. A new React render caused by a state update does *not* interrupt running animations. The 100ms text-streaming pulses in `EnrichStream` will not cause jank in existing block animations.

**The real concern:** The React reconciler itself. When `setBlocks` is called 10 times/second, React re-renders `EnrichStream` and diffs all `blocks.map(...)` children. With motion components, this is more expensive than plain divs — each `motion.div` runs its own reconciliation logic.

**Mitigation: `startTransition` for block appends**

Wrap non-urgent state updates (text streaming) in `startTransition`. This tells React to defer the re-render if something more urgent (user input, scroll) needs the thread:

```tsx
import { startTransition } from "react";

// In scheduleFlush:
const flush = () => startTransition(() => setBlocks([...blocksRef.current]));
```

For `tool-start`, `card`, and `done` events — which are less frequent and user-visible — flush synchronously (current behavior is fine).

**Hardware acceleration:**
- Use `y` instead of `marginTop`/`top` for slide animations (compositor thread)
- Use `opacity` not `visibility` for fades (compositor thread)
- Avoid animating `width`, `height`, `padding` — these trigger layout

**Cap on simultaneous animations:** ~20 concurrently-running motion animations before frame rate degrades. During streaming, typically only 1-2 new blocks are animating at any moment, so this is not a concern.

---

### 5. Layout Animations

**Do NOT add `layout` prop for this use case.** The `layout` prop enables motion to animate existing elements to new positions when the layout shifts. In an append-only vertical feed, existing blocks never move — new blocks append below. Adding `layout` would make motion calculate bounding-box diffs on every block for every state update, adding unnecessary CPU cost during 100ms streaming pulses.

**Scroll-to-bottom during animations:**
The existing `scrollRef.current.scrollTop = scrollRef.current.scrollHeight` in `useEffect([blocks])` fires synchronously after React commits. New blocks will have already animated to `opacity: 0` (their initial state) but the layout height will include them, so scroll works correctly. The entrance animation runs after scroll — this is the desired behavior. No special handling needed.

---

### 6. "use client" Boundary — Next.js App Router Pattern

`motion` requires client components. `EnrichStream` is already `"use client"`, so there's no conflict. The recommended pattern for pushing the boundary as deep as possible:

**Thin animation wrapper (if you ever need server-rendered outer shells):**

```tsx
// components/animated-block.tsx
"use client";
import { motion } from "motion/react";
export { motion };
```

For SSR environments where motion components appear in shared component trees, use the server-safe import:

```tsx
// For components that may render in RSC context
import * as motion from "motion/react-client";
```

Since `EnrichStream` itself is already `"use client"`, the standard import works:

```tsx
import { motion, AnimatePresence } from "motion/react";
```

**LazyMotion for bundle optimization** (recommended if this is the only animation surface):

```tsx
// components/lazy-motion-provider.tsx
"use client";
import { LazyMotion, domAnimation } from "motion/react";
export function AnimationProvider({ children }: { children: React.ReactNode }) {
  return <LazyMotion features={domAnimation}>{children}</LazyMotion>;
}
```

```tsx
// In EnrichStream or a parent layout:
import { m } from "motion/react"; // use m instead of motion.div
// Wrap in <AnimationProvider> once at the layout level
```

This reduces the client JS for motion from ~34 KB to ~4.6 KB.

---

### 7. Tailwind v4 `starting:` Variant — Zero-JS Alternative

Tailwind v4 ships first-class support for `@starting-style` via the `starting:` variant. This is compelling for simple fade-in + slide-up on DOM insertion:

```tsx
<div className="opacity-100 translate-y-0 transition-all duration-[220ms] ease-out
                starting:opacity-0 starting:translate-y-3">
  {/* block content */}
</div>
```

**How it works:** `@starting-style` provides the browser with an "initial state" for the element the first time it's painted. The transition then runs from that state to the current state — pure CSS, zero JS.

**The catch for this streaming UI:** `@starting-style` triggers on DOM insertion. In `EnrichStream`, all blocks are rendered as children of a single `div`. When React adds a new block to the DOM, `@starting-style` fires for that element. **This is exactly what we need — it naturally handles the "only new blocks animate" requirement without `initial={false}`.** Existing blocks are already in the DOM and won't re-trigger.

**Browser support:** Chrome/Edge 117+, Firefox 129+, Safari 17.5+ — ~92% coverage as of 2026.

**When to use CSS vs. motion:**
- `@starting-style` works well for uniform enter-only animations
- Use motion when you need: spring physics, exit animations (thinking indicator fading out), staggered delays, or block-type-specific transitions

---

### 8. Concrete Implementation

Install motion:

```bash
npm install motion
```

**Option A: Full motion with AnimatePresence (recommended for this project)**

```tsx
"use client";

import { motion, AnimatePresence, LazyMotion, domAnimation } from "motion/react";
import { startTransition } from "react";

// Replace the flush line in EnrichStream:
const flush = () => startTransition(() => setBlocks([...blocksRef.current]));

// Add stable IDs when creating blocks (in pushBlock):
const pushBlock = (block: ContentBlock) => {
  const withId = { ...block, id: `${blocksRef.current.length}-${block.type}` };
  // ... rest of pushBlock logic using withId
};

// Replace the blocks.map render:
<LazyMotion features={domAnimation}>
  <AnimatePresence initial={false}>
    {blocks.map((block) => {
      const blockKey = (block as any).id ?? `${block.type}-${blocks.indexOf(block)}`;

      if (block.type === "text") {
        const text = block.text.trim();
        if (!text) return null;
        return (
          <motion.div
            key={blockKey}
            className="enrich-prose"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
          </motion.div>
        );
      }

      if (block.type === "card") {
        const Component = enrichComponents[block.card];
        if (!Component) return null;
        return (
          <motion.div
            key={blockKey}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
          >
            <Component props={block.props as any} />
          </motion.div>
        );
      }

      if (block.type === "tool") {
        const color = block.status === "done" ? "#16a34a" : "var(--color-accent)";
        const icon = block.status === "done" ? "✓" : "●";
        return (
          <motion.div
            key={blockKey}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 14px", /* ... */ }}
          >
            <span style={{ color, flexShrink: 0, fontWeight: 600 }}>{icon}</span>
            <span style={{ /* pill styles */ }}>{block.tool}</span>
          </motion.div>
        );
      }
      return null;
    })}
  </AnimatePresence>
</LazyMotion>
```

**Option B: Pure CSS `@starting-style` via Tailwind v4 (zero-JS, simplest)**

No install needed. Replace each block's wrapper div:

```tsx
// Text blocks
<div
  key={blockKey}
  className="enrich-prose opacity-100 translate-y-0 transition-all duration-200 ease-out starting:opacity-0 starting:translate-y-2.5"
>
  <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
</div>

// Card blocks  
<div
  key={blockKey}
  className="opacity-100 translate-y-0 transition-all duration-300 ease-out starting:opacity-0 starting:translate-y-3.5"
>
  <Component props={block.props as any} />
</div>

// Tool indicators
<div
  key={blockKey}
  className="opacity-100 transition-opacity duration-150 ease-out starting:opacity-0"
  style={{ display: "flex", /* ... */ }}
>
  ...
</div>
```

---

## Trade-offs

| Approach | Pros | Cons | When to Use |
|---|---|---|---|
| `motion` + `AnimatePresence initial={false}` | Full control, exit animations, spring physics, per-type transitions | +4.6–34 KB JS, needs LazyMotion for optimization | Rich per-block animation differences needed |
| CSS `starting:` (Tailwind v4) | Zero JS, no install, browser-native | No exit animations, no springs, uniform behavior, no IE11 | Simple enter-only fade/slide, prefer minimum deps |
| `@formkit/auto-animate` | One-line setup, handles reorders | No per-type control, 2KB but less flexible | Homogeneous lists with possible reorder |

---

## Recommendations

1. **Start with Tailwind v4 `starting:` variant** (Option B) — zero dependencies, handles the "only animate new blocks" requirement natively, and ships this week. The project already has Tailwind v4 (`tailwindcss: ^4.3.0`). Browser coverage is sufficient for a developer tool.

2. **Upgrade to `motion` when** you need: the thinking indicator to fade out (exit animation), staggered card entrances, or spring-based transitions that feel more physical. Add `LazyMotion features={domAnimation}` to keep the bundle at ~4.6 KB.

3. **Add `startTransition` to the text-streaming flush path** regardless of which animation approach you use — this is a pure React concurrency win that reduces main-thread pressure during 100ms streaming pulses and costs nothing.

4. **Never use array index as key** for animated blocks. Assign a stable ID when creating blocks in `pushBlock` (e.g., `id: crypto.randomUUID()` or `id: \`${type}-${blocksRef.current.length}\``).

5. **Skip `layout` prop** — it provides no value for append-only feeds and adds unnecessary computation.

---

## Sources

- [motion.dev — AnimatePresence](https://motion.dev/docs/react-animate-presence) — initial={false} behavior, mode prop, key requirements
- [motion.dev — React Motion Component](https://motion.dev/docs/react-motion-component) — initial/animate props, hardware acceleration, SSR import
- [motion.dev — Reduce Bundle Size](https://motion.dev/docs/react-reduce-bundle-size) — LazyMotion, m component, 4.6 KB target
- [motion.dev — React's experimental ViewTransition](https://motion.dev/blog/reacts-experimental-view-transition-api) — startTransition + animation interaction, future direction
- [nerdy.dev — @starting-style + transition-behavior](https://nerdy.dev/using-starting-style-and-transition-behavior-for-enter-and-exit-stage-effects) — full CSS-only enter/exit pattern
- [stevekinney.com — Tailwind starting: variant](https://stevekinney.com/courses/tailwind/starting-style) — Tailwind v4 starting: usage and patterns
- [Tailwind CSS — transition-behavior](https://tailwindcss.com/docs/transition-behavior) — allow-discrete documentation
- [MDN — @starting-style](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@starting-style) — browser support, spec
- [Syncfusion — React animation library comparison](https://www.syncfusion.com/blogs/post/react-animation-libraries-comparison) — performance tier comparison
- [Framer Motion performance pitfalls — DEV](https://dev.to/whoffagents/framer-motion-animations-that-dont-kill-performance-patterns-and-pitfalls-5cki) — transform/opacity GPU rule, 20-animation cap
- [npm — motion package](https://www.npmjs.com/package/motion) — bundle sizes, tree-shaking
- [vercel/ai-chatbot](https://github.com/vercel/ai-chatbot) — reference implementation using motion ^12 with streaming chat UI
- [motion — GitHub issues #724](https://github.com/framer/motion/issues/724) — AnimatePresence initial={false} subtree propagation caveat

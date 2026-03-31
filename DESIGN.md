# Design System — Gist

## Product Context
- **What this is:** A daily personal operating brief — paper-forward, screen-minimizing. Delivers a morning gist (calendar, weather, news summary) via fax + web, and an evening gist where users mark up a paper sheet and fax it back.
- **Who it's for:** Focus-seeking individuals who want less screen time. Early adopters include small business owners (bar owners, shop managers) who need a calm daily briefing.
- **Space/industry:** Calm tech, analog-digital hybrid, personal productivity
- **Project type:** Web app (Angular 17 + Firebase) with fax delivery integration
- **Tagline:** "Your day, on paper."

## Design Thesis
Gist should feel like a **print artifact with a web mirror** — not a digital product with analog touches. The fax is the product. The paper is the interface. The web app exists to configure and complement the physical experience.

The emotional register is **editorial luxury**: the authority of a well-typeset broadsheet, the warmth of ink on good paper. The user should feel *served* — like someone thoughtful composed this for them — not managed.

## Aesthetic Direction
- **Direction:** Editorial / Magazine
- **Decoration level:** Intentional — subtle paper grain texture on surfaces, thin ruled lines as dividers. No decorative blobs, no gradients, no colored circles around icons. Decoration should feel like print production marks.
- **Mood:** Calm, sophisticated, deliberate. Like opening a quality newspaper with your morning coffee. Luxurious but not ostentatious.
- **Reference sites:** Kinfolk (kinfolk.com), Punkt (punkt.ch), Daybridge (daybridge.com)

## Typography
- **Display/Hero:** Instrument Serif — elegant, high-contrast editorial serif. Broadsheet masthead energy. Used for headlines, hero text, section titles, and the gist's paper-like content headings.
- **Body:** Instrument Sans — clean, readable companion to Instrument Serif. Designed to pair. Used for UI labels, navigation, body paragraphs, button text, form inputs.
- **UI/Labels:** Same as body (Instrument Sans)
- **Data/Tables:** Geist Mono (tabular-nums) — for weather data, times, stats, schedule entries. Modern monospace with excellent tabular figures.
- **Code:** Geist Mono
- **Loading:** Google Fonts — `https://fonts.googleapis.com/css2?family=Instrument+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Instrument+Serif:ital@0;1&family=Geist+Mono:wght@400;500;600&display=swap`
- **Scale:**
  - Display: 48px (clamp 40–64px) — Instrument Serif
  - H1: 36px — Instrument Serif
  - H2: 28px — Instrument Serif
  - H3: 22px — Instrument Serif
  - Body: 16px — Instrument Sans
  - Small: 14px — Instrument Sans
  - Caption/Mono: 13px — Geist Mono
  - Micro: 11px — Geist Mono (timestamps, page markers, section labels)
  - Nano: 9–10px — Geist Mono (preparation stamps, footers)

## Color
- **Approach:** Restrained — color is rare and meaningful. The palette is built around paper and ink, not brand colors.
- **Paper (background):** #f8f5f0 — warm off-white, slightly yellowed like quality newsprint
- **Surface:** #fdfcf9 — cards, elevated panels
- **Surface Alt:** #f3efe8 — secondary surfaces, hover states
- **Surface Muted:** #ece8e0 — disabled states, subtle backgrounds
- **Ink (primary text/accent):** #1a1a2e — deep indigo, not pure black. Feels like ink on paper rather than pixels on glass. This IS the accent color.
- **Ink Strong:** #0d0d1a — maximum emphasis, rare usage
- **Muted text:** #6b6560 — secondary text, captions, placeholders
- **Border:** #ddd8d0 — card edges, dividers
- **Border Strong:** #c8c2b8 — active dividers, emphasized separators
- **Semantic:**
  - Success: #2f6b2f — forest green, muted
  - Warning: #9b6a12 — amber, muted
  - Error: #8b3a3a — brick red, muted
  - Info: #2a4a7a — steel blue, muted
- **Dark mode strategy:** Invert surfaces to warm dark grays (#0f1013 → #16171c → #1c1d24). Reduce ink saturation. Lighten semantic colors for readability. Maintain the warm undertone — dark mode should feel like reading under a desk lamp, not staring at a void.
  - Background: #0f1013
  - Surface: #16171c
  - Surface Alt: #1c1d24
  - Surface Muted: #24252e
  - Ink: #e8e4dc
  - Ink Strong: #f5f2ec
  - Muted: #8a8580
  - Border: #2a2b34
  - Border Strong: #3a3c48
  - Success: #6acb6a, Warning: #f1b86a, Error: #e87878, Info: #6a9ef1

## Spacing
- **Base unit:** 4px
- **Density:** Comfortable — generous but not wasteful. Content should breathe like a well-set page.
- **Scale:** 2xs(2px) xs(4px) sm(8px) md(16px) lg(24px) xl(32px) 2xl(48px) 3xl(64px)

## Layout
- **Approach:** Grid-disciplined — strict column grid like a newspaper. Content lives in clear columns with strong horizontal rules as section dividers.
- **Grid:** Single column on mobile, 2-column asymmetric on tablet+, with sidebar capability
- **Max content width:** 1040px
- **Border radius:** Hierarchical — cards: 18px (generous, modern), smaller elements: 8px, form inputs: 8px, pills/badges: 4px, full-round: 9999px (avatars, toggles)

## Motion
- **Approach:** Minimal-functional — paper doesn't animate. Only transitions that aid comprehension.
- **Easing:** enter(ease-out) exit(ease-in) move(ease-in-out)
- **Duration:** micro(50–100ms) short(150–250ms) medium(250–400ms)
- **Guidelines:** Subtle fade-ins on page load. Smooth transitions on state changes (hover, focus, active). No bounce, no spring, no parallax. If you wouldn't see it in a printed newspaper, it doesn't belong.

## Paper Grain
A defining visual element. Apply a subtle SVG noise texture over surfaces to simulate the tactile quality of newsprint. The grain should be barely perceptible on light mode and even subtler on dark mode. Implementation:

```css
--grain: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.03'/%3E%3C/svg%3E");
```

Apply as a `::before` pseudo-element on the body with `pointer-events: none` and a high z-index.

## Production Marks
Cherry-picked from the "bureau" concept to add personality without coldness:
- **Preparation timestamp:** `PREPARED 05:47 EST` in micro monospace, light gray, top-right of gist cards
- **Page markers:** `[1 OF 1]` in nano monospace, bottom-right of gist content
- **Section labels:** Uppercase monospace with letter-spacing (0.08–0.1em) for section headers within the gist

These marks should feel like subtle print production artifacts, not UI chrome.

## Anti-Patterns (Never Use)
- Purple/violet gradients
- 3-column feature grid with icons in colored circles
- Centered everything with uniform spacing
- Uniform bubbly border-radius on all elements
- Gradient buttons
- Generic hero sections with stock photography
- Bounce/spring animations
- Inter, Roboto, Poppins, or any overused system-default font as primary
- Pure black (#000000) for text — always use the ink color (#1a1a2e)

---

## Output Template Design System

The delivered Gist (fax, email, print, PDF, web `/today` view) uses a separate typographic and color system optimized for print density and editorial warmth. The web app UI retains the Instrument Serif/Sans system above.

### Typography (Output)
- **Display/Masthead:** Fraunces 800, 46pt, -0.03em tracking. Optical sizing 9–144.
- **Headlines:** Fraunces 700, 16pt, -0.01em
- **Subheads:** Fraunces 500, 8.5–10pt
- **Body:** IBM Plex Sans 300, 8.5pt (body), 7–7.5pt (small), 9pt (lede)
- **Labels/Data:** IBM Plex Mono 300–400, 5–6pt, uppercase, 0.10–0.16em tracking
- **Quotes:** Fraunces italic 300, 10–11pt
- **Loading:** Google Fonts — `https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,700;0,9..144,800;1,9..144,300;1,9..144,400;1,9..144,500&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;1,300;1,400&family=IBM+Plex+Mono:wght@300;400&display=swap`

### Color (Output)
| Token | Hex | Usage |
|-------|-----|-------|
| `--ink` | `#1c1917` | Primary text, heavy rules, masthead |
| `--mid` | `#57534e` | Secondary text, event notes, news summaries |
| `--light` | `#a8a29e` | Timestamps, labels, metadata, footer |
| `--rule` | `#d6d3d1` | Dotted dividers, section borders |
| `--tint` | `#f5f0eb` | Highlight box background |
| `--paper` | `#fffdf9` | Page background |
| `--warm` | `#92400e` | Accent: kickers, section labels, highlight borders |

### Page Geometry (Output)
- Content width: **7in** (centered on US Letter)
- Margins: **0.55in top/bottom, 0.65in left/right** (`@page`)
- Two-column layout via flexbox (`.cols > .c + .c`)
- Column gutter: 10pt margin-left + 10pt padding-left + 0.5pt rule
- Screen preview: 24px body padding, warm gray (`#e7e5e4`) surround, box-shadow

### Visual Grammar (Output)
| Element | Style |
|---------|-------|
| Masthead title | 46pt Fraunces 800, -0.03em tracking |
| Masthead subtitle | Fraunces italic 300, 9.5pt, `--mid` |
| Section labels | IBM Plex Mono 400, 5.5pt, uppercase, 0.16em tracking, `--warm` |
| Heavy rule | 2pt solid `--ink` (masthead bottom) |
| Section rule | 1.5pt solid `--ink` (column header) |
| Light rule | 0.5pt solid `--rule` (between items) |
| Dotted divider | 0.5pt dotted `--rule` (between events/notifications) |
| Highlight box | `--tint` bg, 1.5pt solid `--warm` left border, 7pt 9pt padding |
| Weather temp | Fraunces 500, 20pt |
| Event time | IBM Plex Mono 300, 6pt, `--light`, 36pt min-width |
| Footer | IBM Plex Mono, 5pt, `--light`, 0.1em tracking, uppercase |
| Write lines | 0.5pt solid `--rule` bottom border, 18pt height |

### Information Architecture (Output)
**Page 1 — The Briefing:** Masthead → Weather bar → Rhythms bar → Lede (kicker + headline + editorial paragraph) → Two-column body (left: Schedule + Good News | right: Notifications + People + Quote) → Footer.

**Page 2 — The Reflection:** Compact header → Two-column body (left: Body & Mind + Practice Arc + Moon Highlight + Closing thought | right: Morning Intention write lines + Fax Back checkboxes/write lines + Personal closing quote) → Footer.

### Anti-Patterns (Output-Specific)
- No category-colored left borders on email cards (old template pattern)
- No cover page (old fax template had a cover page — new template goes straight to content)
- No table-based layout for print/fax/PDF (use flexbox — tables only for email-safe variant)
- No Georgia or Arial — always Fraunces / IBM Plex Sans / IBM Plex Mono

---

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-03-25 | Initial design system created | Created by /design-consultation. Editorial/magazine direction based on competitive research across calm-tech space (Kinfolk, Punkt, Daybridge, Things 3, Readwise). |
| 2026-03-25 | Instrument Serif + Sans chosen | Editorial authority, designed as a pair, avoids overused fonts. Broadsheet masthead energy fits "your day, on paper." |
| 2026-03-25 | Deep indigo accent (#1a1a2e) over pure black | Warmer, more human, feels like ink on paper. Still passes WCAG AA. Distinguished from generic dark-mode black. |
| 2026-03-25 | Paper grain texture adopted | Reinforces physical-artifact identity. Immediately distinctive vs. flat surfaces used by all other calm-tech products. |
| 2026-03-25 | Bureau "production marks" cherry-picked | Timestamp and page markers add personality without the cold institutional feel of full bureau aesthetic. User should feel served, not managed. |
| 2026-03-25 | Editorial direction chosen over bureau dispatch | Bureau (intelligence briefing aesthetic) was considered but rejected — too cold and institutional. Gist should feel luxurious, not like the user is a cog in a machine. |
| 2026-03-31 | Output Template design system added | Fraunces + IBM Plex Sans/Mono for delivered Gist output. Web app keeps Instrument Serif/Sans. Two systems, one product. |
| 2026-03-31 | Fraunces chosen for output serif | Variable optical size (9–144), warm editorial feel, pairs well with IBM Plex. 46pt masthead creates iconic brand mark. |
| 2026-03-31 | Warm amber accent (#92400e) | Section labels and highlight borders use amber instead of ink. Creates visual hierarchy without competing with editorial content. |
| 2026-03-31 | Two-page broadsheet structure | Page 1 = briefing (information). Page 2 = reflection (intention + fax-back). Turns one-way output into two-way communication. |
| 2026-03-31 | Structured JSON + template render strategy | Claude outputs Zod-validated sections, template renders HTML. Predictable layout, testable, no LLM HTML generation. |
| 2026-03-31 | Personal countdowns in rhythms bar | User prefs get countdown: { label, targetDate }. Displayed alongside moon, season, daylight in the rhythms bar. |
| 2026-03-31 | Issue numbers tracked per user | gistIssueCount on user doc, incremented per generation. Masthead shows "Vol. I · No. {count}". |

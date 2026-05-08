---
name: KG-Cashier
description: Cashier operations system for KING's GRILL restaurant
colors:
  primary: "#e8a838"
  bg-base: "#111318"
  bg-secondary: "#181b23"
  bg-sidebar: "#13161e"
  surface: "#ffffff09"
  surface-hover: "#ffffff0f"
  border: "#ffffff12"
  border-hover: "#ffffff24"
  text-primary: "#e2e2e6"
  text-muted: "#71717a"
  success: "#22c55e"
  danger: "#ef4444"
  warning: "#f59e0b"
  info: "#3b82f6"
typography:
  display:
    fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "-0.01em"
  label:
    fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, sans-serif"
    fontSize: "11px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.04em"
rounded:
  sm: "8px"
  md: "10px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
  3xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#111111"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "10px 18px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "20px"
  stat-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "16px 20px"
  input:
    backgroundColor: "#ffffff0d"
    textColor: "{colors.text-primary}"
    rounded: "{rounded.sm}"
    padding: "10px 14px"
  nav-item:
    textColor: "{colors.text-muted}"
    padding: "10px 20px"
  nav-item-active:
    backgroundColor: "{colors.primary}1a"
    textColor: "{colors.primary}"
  tag:
    rounded: "20px"
    padding: "3px 10px"
---

# Design System: KG-Cashier

## 1. Overview

**Creative North Star: "The Steady Counter"**

A cashier's workspace that feels solid and trustworthy, like a well-lit mahogany counter in a premium restaurant. Warm dark tones ground the interface. Gold accents mark where attention should go but never compete. Every screen answers one question fast: "What do I need to do right now?"

This system explicitly rejects: generic SaaS dashboards with purple gradients and glassmorphism, overly playful fintech apps with bouncing animations, dense enterprise ERP interfaces with 50-column tables, and crypto/trading platforms with neon glows and dark mode theatrics.

**Key Characteristics:**
- **Warm dark**: backgrounds tinted toward warm gray, never pure black
- **Restrained accent**: gold (#e8a838) used sparingly, for primary actions and active states only
- **Data-first**: numbers and labels dominate, decoration is minimal
- **Vietnamese-native**: DM Sans renders Vietnamese diacritics cleanly at all sizes
- **Scannable**: clear type hierarchy lets cashiers glance, not study

## 2. Colors

A restrained palette: warm dark neutrals carry the surface, gold marks interactive elements, semantic colors (green, red, blue, amber) indicate status. No decorative color.

### Primary
- **King's Gold** (#e8a838): Primary actions, active navigation, and the brand crown. Used at ≤15% of any screen. Its warmth connects to the KING's GRILL brand without overwhelming data.

### Neutral
- **Deep Warm Charcoal** (#111318): The base background. Tinted slightly warm to avoid the harshness of pure black.
- **Elevated Surface** (#181b23): Secondary panels, topbar, modal backgrounds. One step lighter than base.
- **Sidebar Dark** (#13161e): Sidebar background. Distinct from base for spatial separation.
- **Glass Surface** (rgba(255,255,255,0.035)): Card and container backgrounds. Barely visible, creating depth through contrast rather than borders.
- **Primary Text** (#e2e2e6): Body text and headings. High contrast on dark backgrounds.
- **Muted Text** (#71717a): Labels, timestamps, secondary information.
- **Border Line** (rgba(255,255,255,0.07)): Dividers and container outlines. Subtle enough to structure without cluttering.

### Semantic
- **Confirmation Green** (#22c55e): Income, success states, active shifts.
- **Alert Red** (#ef4444): Expenses, errors, destructive actions.
- **Caution Amber** (#f59e0b): Warnings, pending states.
- **Information Blue** (#3b82f6): Informational badges, secondary data categories.

### Named Rules
**The Rarity Rule.** King's Gold appears on no more than 15% of any screen. It marks interactive affordances and active states. When everything is gold, nothing is.

**The No Decoration Rule.** Semantic colors (green, red, amber, blue) indicate data status only. They are never used for backgrounds, gradients, or ornamentation.

## 3. Typography

**Body Font:** DM Sans (with system fallbacks: -apple-system, BlinkMacSystemFont, sans-serif)

**Character:** DM Sans brings a slightly geometric warmth that reads clearly at small sizes. Its optical sizing axis adjusts stroke contrast across the full range, keeping 11px labels and 20px headings equally sharp. The negative letter-spacing on headings (-0.02em) gives them weight without needing a separate display face.

### Hierarchy
- **Display** (700, 20px, 1.3, -0.02em): Section headings and page titles. The largest text on screen.
- **Title** (600, 14px, 1.5, -0.01em): Card headers, modal titles, sub-section labels.
- **Body** (400, 14px, 1.6, -0.01em): Descriptions, form hints, body text. Max line-length: 75ch.
- **Label** (500, 11px, 1.4, 0.04em uppercase): Stat labels, form labels, section navigation labels. Always uppercase with tracked spacing.
- **Numeric** (700, 20px, tabular-nums, -0.02em): Financial figures, stat values, counters. Tabular numerals ensure columns align.

### Named Rules
**The One Family Rule.** DM Sans carries every role. Hierarchy comes from weight (400/500/600/700), size (11/13/14/17/20px), and letter-spacing (tracked uppercase for labels, tight for headings), never from a second typeface.

**The Tabular Numbers Rule.** Every financial figure uses `font-variant-numeric: tabular-nums`. Columns of money amounts must align vertically without exception.

## 4. Elevation

This system is flat by default. Depth comes from tonal layering (progressively lighter surfaces: #111318 → #181b23 → rgba(255,255,255,0.035)) rather than shadows. Shadows are reserved for two situations only.

### Shadow Vocabulary
- **Ambient** (`0 2px 12px rgba(0,0,0,0.3)`): Hover state on buttons and interactive cards. Appears as a response to interaction, not at rest.
- **Elevated** (`0 8px 32px rgba(0,0,0,0.45)`): Modals and overlays. Creates clear separation from the base layer.

### Named Rules
**The Flat-Rest Rule.** No element has a shadow at rest. Shadows appear only as feedback (hover) or to separate layers (modals). If a surface needs to feel elevated, use a lighter background tone instead.

## 5. Components

### Buttons
Confident and quiet. Buttons earn attention through color, not glow.
- **Shape:** Gently rounded (8px radius)
- **Primary:** King's Gold background, dark text (#111). Padding: 10px 18px. Subtle shadow on hover only (0 2px 8px rgba(232,168,56,0.25)).
- **Hover/Focus:** Shadow appears; no transform, no bounce, no scale. Focus ring: 0 0 0 3px rgba(232,168,56,0.15).
- **Outline:** Transparent background, 1px border. Hover lightens border and background (rgba(255,255,255,0.03)). Never turns gold on hover.
- **Danger:** Red background (#ef4444), white text.
- **Small:** 7px 14px padding, 12px font size.

### Cards / Containers
- **Corner Style:** Gently rounded (10px radius)
- **Background:** Glass Surface (rgba(255,255,255,0.035)). Slightly lighter on hover.
- **Shadow Strategy:** None at rest. See Elevation section.
- **Border:** 1px solid rgba(255,255,255,0.07). Hover: rgba(255,255,255,0.14).
- **Internal Padding:** 20px.

### Stat Cards
- **Shape:** Same as cards (10px radius, 1px border)
- **Accent:** No side-stripe border. Status is communicated through the icon background tint (success-bg, danger-bg, info-bg, primary-glow) and text color.
- **Label:** 11px uppercase, tracked, muted text.
- **Value:** 20px, weight 700, tabular-nums.

### Inputs / Fields
- **Style:** Dark glass background (rgba(255,255,255,0.05)), 1px border, 8px radius.
- **Focus:** Border turns gold (#e8a838), ring glow (0 0 0 3px rgba(232,168,56,0.15)).
- **Placeholder:** Muted text color (#71717a).
- **Dark scheme:** All native controls use `color-scheme: dark`.

### Navigation (Sidebar)
- **Background:** Solid dark (#13161e). No blur, no glassmorphism.
- **Items:** 13px, weight 500, muted text. 10px 20px padding.
- **Active:** Gold text, gold-tinted background (rgba(232,168,56,0.10)), 3px gold left border.
- **Section Labels:** 10px uppercase, 1.5px letter-spacing, muted text.
- **Footer:** Shift indicator with pulsing green dot when active.

### Tags / Chips
- **Shape:** Pill (20px radius), 3px 10px padding, 11px weight 600.
- **Variants:** Income (green tint), Expense (red tint), Cash (green), Card (blue), Transfer (gold tint).

### Toasts
- **Shape:** 8px radius, 12px 18px padding.
- **Variants:** Each uses a tinted background + matching border + matching text color. No backdrop-filter blur.
- **Animation:** slideInRight, 0.25s ease. No bounce.

### Modals
- **Overlay:** rgba(0,0,0,0.55) with 4px blur. Minimal blur, not decorative.
- **Content:** #181b23 background, 24px padding, 10px radius.
- **Entry:** translateY(12px) → translateY(0), 0.2s. Subtle, not theatrical.

## 6. Do's and Don'ts

### Do:
- **Do** use King's Gold (#e8a838) exclusively for primary actions, active states, and the brand mark.
- **Do** use tonal layering (#111318 → #181b23 → rgba surface) for depth. Three tones, no more.
- **Do** use tabular-nums on every column of financial data.
- **Do** use uppercase + letter-spacing (0.04em) for labels; negative letter-spacing (-0.02em) for headings.
- **Do** keep Vietnamese diacritics readable at every size, test with "ệ", "ờ", "ữ" characters.
- **Do** keep modals small and focused. If content needs scrolling, it probably needs its own page.

### Don't:
- **Don't** use `border-left` or `border-right` greater than 1px as a colored accent stripe on cards, stat cards, or list items. This is the most recognizable tell of AI-generated UI.
- **Don't** use `backdrop-filter: blur()` decoratively on sidebars or topbars. Blur is reserved for modal overlays only.
- **Don't** use purple gradients, neon glows, or cyan accents. These are generic SaaS dashboard clichés.
- **Don't** use `background-clip: text` with gradient backgrounds. Text is always a solid color.
- **Don't** use bounce or elastic easing. All transitions use ease or exponential ease-out.
- **Don't** add glow shadows (`box-shadow` with colored rgba) to elements at rest. Shadows appear on hover only.
- **Don't** use Inter, Roboto, Geist, or Plus Jakarta Sans. These fonts are flagged as overused in AI-generated interfaces.
- **Don't** animate width, height, padding, or margin. Use transform and opacity for motion.
- **Don't** wrap every piece of content in a bordered card. Use spacing and typography for visual grouping where a container isn't needed.

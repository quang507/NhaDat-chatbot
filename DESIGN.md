---
name: Ny'ah Phú Định SlideBot
description: Cinematic real-time slideshow presentation system for property sales
colors:
  primary: "#e8b84b"
  neutral-bg: "#0b0c12"
  neutral-surface: "#101218"
  text-primary: "#ffffff"
  text-secondary: "#e2e8f0"
typography:
  display:
    fontFamily: "'Google Sans', 'Product Sans', sans-serif"
    fontSize: "clamp(2rem, 5vw, 3.5rem)"
    fontWeight: 800
    lineHeight: 1.1
  body:
    fontFamily: "'Be Vietnam Pro', sans-serif"
    fontSize: "1.25rem"
    fontWeight: 300
    lineHeight: 1.6
rounded:
  sm: "12px"
  md: "16px"
  lg: "24px"
spacing:
  sm: "16px"
  md: "24px"
  lg: "48px"
components:
  slide-container:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.lg}"
    padding: "48px"
  accent-dot:
    backgroundColor: "{colors.primary}"
    rounded: "9999px"
    size: "10px"
---

# Design System: Ny'ah Phú Định SlideBot

## 1. Overview

**Creative North Star: "The Gallery Cinema"**

A cinematic, high-contrast, dark-mode presentation interface designed specifically to be viewed from a distance in a boutique sales gallery environment (3-5 meters from a TV screen). Spacing is large, layout density is low, and visual imagery is elevated to be the hero of the canvas.

**Key Characteristics:**
- Dark navy and charcoal charcoal canvas that feels premium and recedes into the background.
- Warm golden-amber highlights that draw attention to key project details.
- Balanced split layouts that pair copy and images in a stable 16:9 aspect ratio.
- Highly readable, light-weight Vietnamese typography.

## 2. Colors

A premium, high-contrast palette optimized for dark environments and display screens.

### Primary
- **Golden Amber** (#e8b84b): Used for key statistics, bullet accents, and status cues. Represents prestige and premium quality.

### Neutral
- **Charcoal Navy** (#0b0c12): The base page background color. Recedes to prevent screen glare.
- **Deep Slate** (#101218): The main slide container surface color, structured with subtle gradients.
- **Pure White** (#ffffff): Main text color for high legibility.
- **Slate Silver** (#e2e8f0): Secondary body text to create visual hierarchy.

**The Golden Ratio Rule.** The primary Golden Amber accent must represent ≤10% of any given slide's surface area. Its rarity is what gives it premium emphasis.

## 3. Typography

**Display Font:** Google Sans (with Product Sans, sans-serif fallback)
**Body Font:** Be Vietnam Pro (with sans-serif fallback)

**Character:** Clean, corporate display titles paired with extremely clean, light-weight Vietnamese body text that maintains legibility at large sizes.

### Hierarchy
- **Display** (800, clamp(2rem, 5vw, 3.5rem), 1.1): Used for main slide titles.
- **Body** (300, 1.25rem, 1.6): Used for descriptive bullet points. Cap line length at 75ch.
- **Label** (500, 0.75rem, tracking-wide): Used for headers, statuses, and caption descriptions.

## 4. Elevation

The system is flat by default with a subtle glow strategy. Instead of heavy, diffuse drop shadows which muddy dark themes, it uses thin, high-contrast borders and radial gradients to express depth.

**The Glow-On-State Rule.** Card surfaces remain flat with a thin `#ffffff`/0.05 border. Soft, gold-tinted glow filters should only appear during active states (e.g. mic listening, active speech).

## 5. Components

### Slide Containers
- **Shape:** Rounded-3xl (24px)
- **Primary:** Dark slate background with a dual-radial gradient from top-left and bottom-right.
- **Border:** Thin `#ffffff`/0.05 borders.

### Bullet Points
- **Shape:** Pilled-accent dots (9999px)
- **Primary:** Golden Amber (#e8b84b) with a scale-up transition on hover/active.

### Image Carousel
- **Style:** Pure black container backdrop, cross-fade slide transitions (1s duration), active carousel indicators displaying as pilled amber dots.

## 6. Do's and Don'ts

### Do:
- **Do** maintain a strict 16:9 aspect-ratio on all slide layouts.
- **Do** balance text-only slides with balanced center alignments.
- **Do** use `text-wrap: balance` on H2 titles to prevent orphaned words.

### Don't:
- **Don't** use low-contrast grey body text that is unreadable from a distance.
- **Don't** use neon, generic SaaS blue/violet gradients.
- **Don't** use rounded corners larger than 24px (keep inputs at 12px, slides at 24px).
- **Don't** pair borders with heavy drop-shadows on cards.

---
name: nhadat_brand_style
description: Use when styling, designing, coding, editing, or auditing any user interface, slide, or component for Nhã Đạt Co Ltd or the Ny'ah Phú Định project. Ensures that colors, typography, logos, curved structures, and layout aesthetics are consistent with the official NhaDat Company Profile.
---

# Nhã Đạt Brand Design Style System & Guidelines

This document defines the brand style system and guidelines for **Nhã Đạt Co Ltd** and its project **Ny'ah Phú Định**, extracted from the official Company Profile and aligned with the *impeccable skills* standard.

---

## 1. Brand Identity & Visual Language

### Core Brand Philosophy
*   **Creative North Star**: "Chất liệu của hạnh phúc – Elements of Life". 
*   **Design Persona**: Warm, thoughtful, elegant, and connected to nature. Houses are designed "như tay mẹ dịu dàng, ôm trọn vào lòng tinh hoa thiên nhiên, chắt chiu nắng gió, lan tỏa khí tươi" (like a mother's gentle hand, embracing nature's essence, wind, and fresh air).
*   **Four Pillars**:
    1.  *Hơi thở cuộc sống* (Breath of life)
    2.  *Sức mạnh thiên nhiên* (Power of nature)
    3.  *Tình yêu trẻ thơ* (Love for children)
    4.  *Bật tung năng lượng* (Unleash energy)

---

## 2. Color System (Brand Palette)

Apply these colors to maintain the official identity. Never use generic SaaS blues or violets.

### Primary Color (Terracotta / Earthy Red-Brown)
*   **Hex**: `#802613` (or `#7B2E1D`)
*   **Role**: Brand anchor, logo background, main headers, primary call-to-actions, and prestigious highlights. Represents clay, brick, earth, and premium construction quality.

### Secondary Accent Color (Forest Green)
*   **Hex**: `#1E5E3A` (or `#2E7D32`)
*   **Role**: Represents nature, clean air (ByteLife tech), parks, green balconies, and "cuộc sống hạnh phúc". Use for positive highlights, green accents, and environment-related stats.

### Background Colors
*   **Light Theme / Brand Sheets**: Warm off-white or light cream (`#FDFBF7` or `#FAF7F2`) representing paper/linen.
*   **Dark Theme / Slide Cinema Mode**: Deep Slate Navy (`#0B0C12` / `#101218`) for gallery display screens, ensuring high contrast.

---

## 3. Typography & Hierarchy

Ensure clean, legible Vietnamese type pairing.

*   **Display / Title Font**: `Google Sans` (fallback `Product Sans`, `Outfit`, `sans-serif`)
    *   *Weight*: Medium (500) to Bold (800)
    *   *Letter-spacing*: `tracking-tight` (floor: `≥ -0.04em`)
    *   *Feature*: `text-wrap: balance` to prevent orphaned words.
*   **Body / Content Font**: `Be Vietnam Pro` (fallback `Inter`, `sans-serif`)
    *   *Weight*: Light (300) to Regular (400)
    *   *Line-height*: Spacious (approx `1.6`)
    *   *Feature*: `text-wrap: pretty` for body paragraphs, capped line length at `65-75ch`.

---

## 4. Layout & Aesthetics (Impeccable Skills Standard)

To translate Nhã Đạt's brand persona of "mother's gentle hand" into the digital interface, follow these rules:

### Curved Framing (The "Gentle Hand" Rule)
*   **Concept**: Avoid rigid box layouts. Architectural photos and visual slides should use curved shapes and circular frames.
*   **Implementation**: Use soft clip-paths, circular masks, or smooth wave dividers.
    *   *Example*: Clip an image container using `border-radius: 100% 0 100% 0` or custom SVG paths to mimic organic flow.

### Clean Space & High Contrast
*   **Layout Density**: Keep spacing large and content density low. Slides are designed for a 16:9 canvas viewed from 3–5 meters.
*   **Contrast Check**: Body text must hit `≥ 4.5:1` contrast ratio. Tinted neutrals should use hue-specific values matching Terracotta or Forest Green, never flat grey.

### Smart Technology (ByteLife UI)
*   For slides representing smart home features (sensors, clean air, zero management fees):
    *   Use dark minimal backgrounds with subtle radial light sweeps.
    *   Represent clean air using elegant abstract line waves (`ByteLife` brand element).
    *   Keep icons modern and lightweight.

---

## 5. Do's and Don'ts

### Do:
*   **Do** use Terracotta (`#802613`) as the default accent color instead of generic yellow or orange.
*   **Do** use Forest Green (`#1E5E3A`) to highlight fresh air, green parks, and organic themes.
*   **Do** use large, airy letter spacing and balanced text alignments.
*   **Do** pair text descriptions with high-quality, normalized 2K images.

### Don't:
*   **Don't** use standard neon blue, purple, or indigo colors.
*   **Don't** make layout corners sharper than necessary, but avoid over-rounding card shapes beyond `24px` unless it's a dedicated organic mask.
*   **Don't** add drop shadows underneath borders; choose either a clean border or a soft gradient glow.

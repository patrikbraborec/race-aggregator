# Design System — Bold Nordic

## Philosophy

Confident, structured, alive. Inspired by Scandinavian minimalism but with the courage to be bold. Visible grid lines as decoration, monospace data typography, colored dot indicators, and expressive serif headlines. The UI should feel like a well-designed race bib — functional, structured, but unmistakably energetic.

## Color Palette

| Token            | Hex       | Usage                              |
| ---------------- | --------- | ---------------------------------- |
| `--color-bg`     | `#F4F1EB` | Page background (warm cream)       |
| `--color-surface`| `#FFFFFF` | Cards, panels                      |
| `--color-primary`| `#1B3A2D` | Headers, primary actions, nav (deep forest green) |
| `--color-primary-light` | `#2D5A45` | Hover states               |
| `--color-accent` | `#E8613A` | Bold orange — CTAs, highlights, energy |
| `--color-accent-light` | `#FCEEE8` | Accent background tint      |
| `--color-text`   | `#1A1A1A` | Primary text                       |
| `--color-text-secondary` | `#7A7A72` | Secondary/muted text        |
| `--color-border` | `#C8C4BA` | Visible borders, grid lines (intentionally prominent) |
| `--color-success`| `#3A7D5C` | Positive indicators                |
| `--color-error`  | `#C44D4D` | Errors, negative indicators        |

### Terrain Dot Colors

Colored dots (8px circles) precede terrain labels — inspired by Pelata's indicator system:

| Terrain   | Dot color   |
| --------- | ----------- |
| Road      | `#6B7280`   |
| Trail     | `#3A7D5C`   |
| Ultra     | `#7C3AED`   |
| Cross     | `#D97706`   |
| Obstacle  | `#DC2626`   |
| Mixed     | `#1B3A2D`   |

## Typography

Three-font system for character and hierarchy:

- **Display**: `DM Serif Display` — hero headlines, page titles. Large, expressive, serif.
- **Body**: `Inter` — UI text, paragraphs, buttons. Clean and functional.
- **Mono**: `JetBrains Mono` — data labels, stats, distances, prices, dates. Gives a technical/sporty feel.

### Scale
- Hero headline: `3.5rem / 400` in DM Serif Display
- Page title: `2rem / 400` in DM Serif Display
- Section heading: `1.25rem / 600` in Inter, uppercase, letter-spacing `0.05em`
- Body: `1rem / 400` in Inter
- Data label: `0.8125rem / 500` in JetBrains Mono, uppercase, letter-spacing `0.06em`
- Data value: `0.9375rem / 600` in JetBrains Mono
- Small/caption: `0.75rem / 500` in JetBrains Mono

## Layout

- **Max content width**: `1200px`, centered
- **Grid lines**: Use visible `1px` borders (`--color-border`) as structural decoration — between grid cells, around cards, as section dividers
- **Card grid**: Grid with visible cell borders (like a data table, not floating cards)
- **Page padding**: `2rem` (desktop), `1rem` (mobile)
- **Section spacing**: `3rem` between sections

## Cards

Cards use **visible borders** instead of shadows — a defining trait of this design:

- Background: `--color-surface`
- Border: `1px solid var(--color-border)`
- Border-radius: `0` (sharp corners for the grid aesthetic) — or `2px` max
- Padding: `1.5rem`
- No shadow
- Hover: border color shifts to `--color-primary` or `--color-accent`
- Optional: accent-colored top border (`3px solid var(--color-accent)`) for featured items

## Components

### Hero Section
- Large DM Serif Display headline, `3.5rem`
- Subtitle in Inter, `--color-text-secondary`
- CTA button: `--color-accent` bg, white text, pill shape with arrow icon
- Decorative thin horizontal rule below

### Stat / Data Display
- Monospace (JetBrains Mono) for all numbers and data
- Label in uppercase mono, `--color-text-secondary`
- Value below in larger mono weight
- Colored dot prefix for categorized data

### Race Card (List Row Style)
- Full-width, bordered top and bottom (`1px`)
- Left: colored terrain dot + race name (Inter, semibold)
- Middle: date + city in mono
- Right: distance in mono, arrow icon
- Hover: background shifts to `--color-accent-light`

### Buttons
- Primary: `--color-accent` bg, white text, `12px 28px` padding, `999px` radius (pill)
- Secondary: transparent bg, `1px` border `--color-border`, `--color-text` text
- With arrow: append `->` in monospace
- Font: `0.875rem / 600` Inter
- Hover: primary darkens, secondary border to `--color-primary`

### Navigation
- Monospace labels, uppercase, `0.05em` tracking
- Active: `--color-primary` text, underline offset `4px`
- Inactive: `--color-text-secondary`
- No background pills — text-only nav

### Filter Controls
- Inputs with visible borders (no shadow)
- Labels in uppercase mono
- Select dropdowns with border style
- Active filter: `--color-accent` border

### Badges / Pills
- Colored dot + text in mono
- No background — just the dot and label
- Or: thin border pill, `999px` radius, mono text

### Terrain Indicator
- `8px` colored circle (dot) + label in JetBrains Mono
- Used consistently everywhere terrain type appears

## Decorative Elements

- **Horizontal rules**: `1px solid var(--color-border)`, full-width, used generously between sections
- **Grid borders**: Visible cell borders in card grids
- **Accent lines**: `3px` accent-colored top borders on featured elements
- **Arrow icons**: `->` in monospace as link/button suffixes

## Spacing Scale

`4px — 8px — 12px — 16px — 24px — 32px — 48px — 64px`

## Icons

- Style: outlined, 1.5px stroke, rounded caps
- Size: `20px` default, `16px` inline with mono text
- Color: inherits text color
- Library: Lucide Icons

## Transitions

- Duration: `150ms`
- Easing: `ease-in-out`
- Apply to: border-color, background-color, color, transform

## Responsive Breakpoints

| Name    | Width     |
| ------- | --------- |
| Mobile  | `< 640px` |
| Tablet  | `640-1024px` |
| Desktop | `> 1024px` |

## Do / Don't

- **Do**: Use visible borders and grid lines as design elements
- **Do**: Mix serif headlines with monospace data — the contrast creates energy
- **Do**: Use colored dots consistently for terrain categories
- **Do**: Let monospace typography carry data — it's the personality of the UI
- **Don't**: Use shadows — borders replace them entirely
- **Don't**: Round corners more than `2px` on cards (pills are the exception)
- **Don't**: Hide structure — the grid IS the decoration
- **Don't**: Use more than one accent color per view

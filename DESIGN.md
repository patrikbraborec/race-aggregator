# Design System — Scandinavian Minimalist

## Philosophy

Clean, calm, functional. Every element earns its place. Generous whitespace, muted palette, soft shapes. The UI should feel like a quiet Nordic morning — clear and unhurried.

## Color Palette

| Token            | Hex       | Usage                              |
| ---------------- | --------- | ---------------------------------- |
| `--color-bg`     | `#F5F3EF` | Page background (warm off-white)   |
| `--color-surface`| `#FFFFFF` | Cards, panels                      |
| `--color-primary`| `#2D4A3E` | Headers, primary actions, nav      |
| `--color-primary-light` | `#3A6354` | Hover states, secondary accent |
| `--color-accent` | `#8B6F4E` | Warm brown accent (charts, badges) |
| `--color-text`   | `#1A1A1A` | Primary text                       |
| `--color-text-secondary` | `#6B7280` | Secondary/muted text        |
| `--color-border` | `#E5E5E0` | Subtle borders, dividers           |
| `--color-success`| `#3A7D5C` | Positive indicators (+%)           |
| `--color-error`  | `#C44D4D` | Errors, negative indicators        |

## Typography

- **Font family**: `Inter` (primary), `system-ui` (fallback)
- **Scale**:
  - Hero numbers: `2.5rem / 700` (e.g. race count, total stats)
  - Page title: `1.75rem / 700`
  - Section heading: `1.125rem / 600`
  - Body: `1rem / 400`
  - Caption/label: `0.875rem / 500` in `--color-text-secondary`
  - Small: `0.75rem / 400`
- **Letter spacing**: `-0.01em` on headings, default on body

## Layout

- **Max content width**: `1200px`, centered
- **Grid**: 12-column on desktop, single column on mobile
- **Card grid**: `auto-fill, minmax(300px, 1fr)` with `1.5rem` gap
- **Page padding**: `2rem` (desktop), `1rem` (mobile)
- **Section spacing**: `2.5rem` between sections

## Cards

- Background: `--color-surface`
- Border-radius: `16px`
- Padding: `1.5rem`
- Shadow: `0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02)`
- No visible border (shadow only)
- Hover: shadow deepens to `0 4px 12px rgba(0,0,0,0.06)`

## Components

### Stat Card
- Large number top-left, `2.5rem / 700`
- Decimal/unit in lighter weight `1.5rem / 400`
- Label below in caption style
- Optional trend badge: small pill with `+X%` in `--color-success`

### List Row
- Rank number (muted) | Icon/avatar (40px circle) | Title + subtitle | Value right-aligned
- Divider: 1px `--color-border` between rows
- Row padding: `0.75rem 0`

### Bar Chart
- Bars: `--color-primary` (active month), `--color-border` (inactive)
- Rounded top caps: `4px`
- Labels below in caption style
- Highlight value above active bar

### Buttons
- Primary: `--color-primary` bg, white text, `12px 24px` padding, `10px` radius
- Secondary: transparent bg, `--color-primary` text, 1px border
- Border-radius: `10px`
- Font: `0.875rem / 600`

### Navigation / Tabs
- Pill-style tabs: active = `--color-primary` bg + white text
- Inactive = transparent + `--color-text-secondary`
- Border-radius: `8px`
- Gap: `0.25rem`

### Badges / Pills
- Small rounded pill (`999px` radius)
- Success: light green bg (`#E8F5E9`) + `--color-success` text
- Neutral: `--color-bg` bg + `--color-text-secondary` text
- Padding: `2px 10px`
- Font: `0.75rem / 500`

## Spacing Scale

`4px — 8px — 12px — 16px — 24px — 32px — 48px — 64px`

## Icons

- Style: outlined, 1.5px stroke, rounded caps
- Size: `20px` default, `24px` in navigation
- Color: inherits text color
- Library recommendation: Lucide Icons

## Transitions

- Duration: `150ms`
- Easing: `ease-in-out`
- Apply to: shadow, background-color, color, transform

## Responsive Breakpoints

| Name    | Width     |
| ------- | --------- |
| Mobile  | `< 640px` |
| Tablet  | `640–1024px` |
| Desktop | `> 1024px` |

## Do / Don't

- **Do**: Use whitespace generously. Let content breathe.
- **Do**: Keep hierarchy clear — one hero element per card.
- **Don't**: Add decorative borders or heavy shadows.
- **Don't**: Use more than 2 font weights per component.
- **Don't**: Crowd elements — minimum `16px` between interactive targets.

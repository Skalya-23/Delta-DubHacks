# Delta design system

**Delta (Δ): version control for the physical world.** The look is an *engineering notebook meets a timeline*: calm, warm, visual. Photos of the bench lead every screen and the text stays short and plain. Someone who has never used Git should understand any screen in a few seconds.

## Brand
- **Logo:** artwork is in `frontend/public/images/`: the originals (`delta-logo-wordmark.png`, `delta-app-icon-dark.png`, `delta-app-icon-light.png`) plus transparent versions cut from them: `delta-mark.png` (the orange Δ), `delta-wordmark-text.png` (the "DELTA" lettering, used as a CSS mask so it follows the text color in light and dark mode), and `delta-icon-dark.png` / `delta-icon-light.png` (rounded app icons). `<DeltaLogo />` = mark + lettering; `<DeltaIcon />` = mark only; `<DeltaAppIcon />` = rounded icon. The browser tab uses `public/favicon.png` and `apple-touch-icon.png` (the dark app icon).
- **Tagline:** "Version control for the physical world."

## Color tokens (`src/index.css`, light is the default)
| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `#FAF8F5` paper | `#141312` graphite | page |
| `--card` | `#FFFFFF` | `#1D1C1A` | cards (1px `--border` + soft shadow) |
| `--border` | `#ECE8E1` | `#2C2A27` | hairlines |
| `--foreground` | `#1C1B19` | `#F2EFEA` | text |
| `--muted-foreground` | `#6F6A62` | `#A39E95` | secondary text (≥4.5:1 on background) |
| `--brand` | `#FF5B1F` | `#FF6A33` | logo, primary buttons, active nav, focus ring, rail highlights |
| `--brand-text` | `#C2410C` | `#FF8A5C` | orange *text* (darker in light mode for contrast) |
| `--works` / `--broken` / `--untested` | `#16A34A` / `#E11D48` / `#8A8378` | lighter variants | status pills (dot + word) |
| `--added` / `--removed` / `--moved` | `#0D9488` / `#E11D48` / `#F59E0B` | lighter variants | change chips, boxes |
| `--ai` | `#7C3AED` | `#A78BFA` | AI-written content only |
| `--heat-0..4` | paper → Delta orange | graphite → orange | activity heatmap |

Nothing uses GitHub blue or green as a brand color. Status and change colors always appear with a word or icon, never color alone.

## Type
- **Space Grotesk 600** for headings (page titles 30px), **Inter** for body (15px, line-height 1.6), **JetBrains Mono** for numbers like `#12`. Loaded from Google Fonts.

## Shape, space, motion
- Cards have a 16px radius. Buttons, inputs, chips and pills are fully rounded. Content is max 1100px wide and centered, with generous padding.
- lucide-react icons at a 1.75 stroke.
- Motion: cards fade and rise 6px on mount (`.rise`), and new timeline items slide in from the top (`.slide-in`). A CSS confetti burst plays when a restore finishes. Everything is disabled under `prefers-reduced-motion`.

## Layout
- **Left sidebar** (240px, collapsible to a 72px icon rail; a drawer under 768px): logo, *All projects*, then the current project with **Timeline · Checkpoints · Documentation**, and at the bottom the project settings gear, the theme toggle and the avatar menu.
- Compare, Go back and Live camera are **actions** (buttons), not tabs. There is no top bar, no breadcrumbs and no hashes (the full ID lives under *Details*).

## Words (UI only; the database keeps its names)
Commit → **Change #12** · history → **Timeline** · Compare → **Compare two moments** · Restore → **Go back to this** · Hide as noise → **Not a real change** · Working/Broken/Untested → **Works/Broken/Not tested** · Mk1 summary → **What the AI saw** · user description → **Your notes** · notes thread → **Team comments** · Docs → **Documentation** · At the bench → **Who's building** · Live view → **Live camera** · Diff → **What changed**.

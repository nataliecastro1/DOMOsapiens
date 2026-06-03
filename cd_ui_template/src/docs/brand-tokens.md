# Anglepoint Design Tokens

Extracted from the website stylesheet (`assets/styles/_global-vars.scss` and `assets/styles/styles.scss`) and the 2026 Brand Guidelines. For the raw SCSS source or compiled CSS, read those files directly.

## Color Palette

### Primary Colors
| CSS Variable     | Hex       | Pantone    | CMYK           | Usage                               |
|-----------------|-----------|------------|----------------|-------------------------------------|
| `--yellow`      | `#ffad00` | 2010 C     | 0/36/100/0     | Primary accent (APT Gold), CTAs, link underlines, borders, logo mark |
| `--light-blue`  | `#0089af` | —          | —              | Secondary accent, service links     |
| `--blue`        | `#005f86` | 7469 C     | 94/59/28/8     | Mid-tone brand blue (APT Blue), logo wordmark |
| `--dark-blue`   | `#003861` | —          | —              | Deep blue                           |
| `--navy`        | `#001941` | 282 C      | 100/90/39/53   | Primary text color (APT Navy), dark backgrounds |

### Supporting Colors
| CSS Variable | Hex       | Usage                  |
|-------------|-----------|------------------------|
| `--red`     | `#d12742` | Tags, accents          |
| `--orange`  | `#fb790f` | Warm gradient          |
| `--green`   | `#5fd1a7` | Tags, cool gradient    |
| `--maroon`  | `#83064e` | Warm gradient          |
| `--purple`  | `#430051` | Warm gradient end      |

### Navy Tints (for backgrounds/borders)
| CSS Variable  | Hex (approx.) | Definition                                    |
|---------------|---------------|-----------------------------------------------|
| `--navy-4`    | `#f5f6f7`     | `color-mix(in srgb, #001941 4%, #fff)` — lightest tint |
| `--navy-5`    | `#f2f4f6`     | `color-mix(in srgb, #001941 5%, #fff)`        |
| `--navy-10`   | `#e6e8ec`     | `color-mix(in srgb, #001941 10%, #fff)` — subtle bg/borders |
| `--navy-15`   | `#d9dde3`     | `color-mix(in srgb, #001941 15%, #fff)`       |

### Cool Ramp (green → navy)
| CSS Variable | Hex       | Resolves to      |
|-------------|-----------|-------------------|
| `--cool-1`  | `#5fd1a7` | `var(--green)`    |
| `--cool-2`  | `#2aadab` |                   |
| `--cool-3`  | `#0089af` | `var(--light-blue)` |
| `--cool-4`  | `#00749a` |                   |
| `--cool-5`  | `#005f86` | `var(--blue)`     |
| `--cool-6`  | `#004b73` |                   |
| `--cool-7`  | `#003861` | `var(--dark-blue)` |
| `--cool-8`  | `#002851` |                   |
| `--cool-9`  | `#001941` | `var(--navy)`     |

### Warm Ramp (yellow → purple)
| CSS Variable | Hex       | Resolves to      |
|-------------|-----------|-------------------|
| `--warm-1`  | `#ffad00` | `var(--yellow)`   |
| `--warm-2`  | `#fd9308` |                   |
| `--warm-3`  | `#fb790f` | `var(--orange)`   |
| `--warm-4`  | `#e65029` |                   |
| `--warm-5`  | `#d12742` | `var(--red)`      |
| `--warm-6`  | `#aa1648` |                   |
| `--warm-7`  | `#83064e` | `var(--maroon)`   |
| `--warm-8`  | `#630350` |                   |
| `--warm-9`  | `#430051` | `var(--purple)`   |

### Text & Background Pairing
Nearly all text on the site uses one of two combinations:

1. **Navy text on white or light backgrounds** — `color: var(--navy)` on `#fff`, `var(--navy-4)`, or `var(--navy-5)`. This is the default for body content, cards, light sections, and forms.
2. **White text on navy backgrounds** — `color: #fff` on `background: var(--navy)`. Used for dark sections, hero areas, footers, and feature blocks like the "three-column blue box."

Yellow is only an accent color — borders, underlines, CTA fills, hover states. Navy and white handle all body text. Light-blue and blue appear occasionally for links, labels, or pre-headers.

## Typography

### Font Family

**Website**: TT Norms Pro — `font, "font Fallback", TTNormsPro, Arial, sans-serif` via CSS variable `--font-family`. Font files in `assets/fonts/` with `@font-face` in `assets/fonts/fonts.css`.

### Font Weights
| Weight | Name       | CSS Class              |
|--------|-----------|------------------------|
| 300    | Light     | `.TTNormsProLight`     |
| 400    | Regular   | `.TTNormsProRegular`   |
| 500    | Medium    | `.TTNormsProMedium`    |
| 600    | DemiBold  | `.TTNormsProDemiBold`  |
| 700    | Bold      | `.TTNormsProBold`, `b`, `strong` |
| 800    | ExtraBold | `.TTNormsProExtraBold` |

### Body Text
- **Size**: `1.125rem` (18px) / line-height `1.44`
- **Mobile size**: `1.125rem` / line-height `1.5`
- **Color**: `var(--navy)` (`#001941`)

### Heading Scale
| Level | Weight | Size (desktop)    | Line-height | Letter-spacing |
|-------|--------|-------------------|-------------|----------------|
| H1    | 800    | 50px              | 55px        | -0.75px        |
| H2    | 800    | 36px              | 42px        | -0.34px        |
| H3    | 600    | 30px              | 34px        | -0.54px        |
| H4    | 600    | 28px              | 34px        | -0.42px        |
| H5    | 600    | 22px              | 28px        | —              |
| H6    | 300    | 32px              | 1.13        | -0.48px        |

Mobile H1 drops to 36px/40px. H2 drops to 28px on tablet and phone.

Bold+ weights (≥500) should get `letter-spacing: -0.7px` as a general rule.

## Spacing

### Section Padding
| Breakpoint  | Section Padding | Side Padding | CSS Variables                                   |
|-------------|-----------------|--------------|------------------------------------------------|
| Desktop     | 100px           | 80px         | `--desktop-section-padding`, `--desktop-side-padding` |
| Tablet      | 60px            | 30px         | `--tablet-section-padding`, `--tablet-side-padding`   |
| Phone       | 30px            | 30px         | `--phone-section-padding`, `--phone-side-padding`     |

Responsive aliases: `--section-padding` and `--side-padding` automatically switch at breakpoints.

### Border Radius
| Token                    | Desktop | Phone  |
|--------------------------|---------|--------|
| `--page-creep-radius`   | 40px    | 20px   |
| `--inner-border-radius` | 20px    | 10px   |
| `--border-radius-large`  | 20px    | 10px   |
| `--border-radius-small`  | 10px    | 5px    |

## Breakpoints (Divi-based)
| Name     | Max-width | Min-width |
|----------|-----------|-----------|
| Phone    | 767px     | —         |
| Tablet   | 960px     | 768px     |
| Desktop  | —         | 961px     |

Page max-width: `--desktop-pw: 1345px`

## Interactive Patterns

### Standard Link
- `font-weight: 500`, `color: var(--navy)`, underline with `text-decoration-color: var(--yellow)`, thickness 2px
- On hover/focus: `background: var(--yellow)`

### Button (`.button-link`)
- `padding: 12px 20px`, `font-weight: 700`, `border: 2px solid var(--yellow)`, `border-radius: 4px`
- Hover: `background: var(--yellow)`
- Variants: `.navy`, `.blue`, `.white`, `.gray`, `.hollow`, `.arrow`, `.doc-download`

### Arrow Link (`.arrow-link`)
- Flex row with trailing arrow icon. `.triangle` variant uses yellow CSS triangle instead.
# Anti-slop rules

Mandatory. Every user-facing surface and every line of product copy in this
project must pass all twenty-one rules below. These describe what NOT to do:
each one is a recognizable tell of generated, untasted design, and any one
of them makes the whole product read as careless.

A violation is a blocker. Fix it in the change that introduced it. Where a
rule genuinely must be broken, write the argument down at the point of use
and record it in `DESIGN.md` under `## Argued exceptions`. An exception that
is not written down is a violation.

Rules marked **(render)** cannot be judged from source. Render the surface
at 375px and 1440px wide, in every theme shipped, and look at it.

## Visual

1. **No purple-to-blue gradient.** No violet, purple, or indigo paired with
   blue or cyan in any gradient. This is the single most recognizable
   AI-build tell. More broadly: a gradient is not an identity. If the
   product's look depends on one, the design work has not happened yet.
   *Check:* search for `from-purple`/`to-blue` class pairs and for gradient
   declarations whose colors fall in the violet and blue hue ranges.

2. **No gradient hero text.** Headlines are a solid color. No
   `background-clip: text` with a gradient fill, on the hero or anywhere.
   *Check:* search for `bg-clip-text`, `background-clip: text`,
   `text-transparent`.

3. **No emoji in headings.** No emoji in any heading, and none used as
   bullets, section markers, or feature icons anywhere in the product.
   *Check:* scan heading elements and Markdown headings for emoji.

4. **No glassmorphism.** No frosted translucent panels. `backdrop-blur` over
   a tinted translucent background is not a default surface treatment.
   *Check:* search for `backdrop-blur` and `backdrop-filter: blur`.

5. **No grain over a gradient.** Noise or grain texture layered on a
   gradient to fake depth is banned. Texture must do real work, not cover
   for a flat composition.
   *Check:* search for noise assets, `feTurbulence`, and grain overlays that
   sit over a gradient.

6. **No low-contrast dark mode. (render)** Dark themes hold the same
   contrast bar as light. Mid-gray body text on near-black is a failure, not
   a mood. Dark mode is designed, not derived by inverting the light theme.
   *Check:* measure real contrast on the dark render. Body text at least
   4.5:1, large text at least 3:1.

## Layout and structure

7. **No three-icon-box row.** The `grid-cols-3` band of icon plus heading
   plus blurb is template furniture. Banned outright.
   *Check:* look for three-up grids whose cells lead with an icon.

8. **No decorative icons.** Icons appear only where they do work:
   navigation, state, affordance. No icon-per-feature grids, no icons in
   tinted rounded squares, no bullet icons restating the text beside them.
   *Check:* list every icon on the surface and name the function each
   performs. If deleting it loses no information, delete it.

9. **No default icon set used wholesale.** Lucide or Heroicons dropped in
   everywhere is a finding. An icon set is a typeface-level decision and
   needs a stated rationale.
   *Check:* count distinct icons imported from one default set.

10. **No badge above the headline.** The small pill announcing "Now in
    beta", "Backed by X", or "v2 is here" above an `h1` is template
    furniture. Announcements earn a real place in the layout or they do not
    ship.
    *Check:* look for a pill element immediately preceding the page
    headline.

11. **No border-accent treatments.** No vertical accent bar on the active
    sidebar item. No left-border accent lines on cards, quotes, alerts, or
    buttons. No saturated border ringing a rounded card. Active states use
    fill, weight, or color. Card separation comes from space, ground, or
    elevation.
    *Check:* search for `border-l`, `border-left`, `border-inline-start`,
    and saturated border colors on rounded containers.

12. **Breathing room, and one spacing scale. (render)** Surfaces feel open.
    Whitespace does the separating, not boxes and rules. Working floors:
    page margins at least 16px at 375 and at least 48px at 1440;
    space between groups at least 1.5 times the space within a group. Every
    spacing value comes off one scale, a 4px grid unless the project sets
    another. One-off values like `p-[13px]` or `padding: 27px` are a
    finding. Inconsistent spacing is what makes a surface read as assembled
    rather than designed.
    *Check:* measure margins and group spacing on the render. Search for
    arbitrary spacing values off the scale.

## Type

13. **No italics.** Emphasis comes from weight, size, or color. No italic
    quotes, captions, or placeholders. The serif italic word dropped into a
    sans headline for editorial flavor is the specific banned case.
    *Check:* search for `italic`, `font-style: italic`, `oblique`, `<em>`.

14. **Deliberate typefaces only.** The typeface is a decision with a stated
    rationale, not the framework default left in place. Specifically banned
    without a written argument: Inter everywhere, Roboto, Open Sans, and the
    Space Grotesk plus Instrument Serif pairing, which now reads as
    instantly generated. Fallback stacks are fine; it is the first family
    that counts.
    *Check:* read the first family in every font stack, plus
    `next/font/google` imports and Google Fonts URLs. Ask: could this be any
    template?

## Motion and interaction

15. **No fade-in on scroll.** Content does not fade or slide in as the
    viewport reaches it. Scroll-triggered reveals delay reading, break
    find-in-page, and read as filler motion.
    *Check:* search for `whileInView`, `useInView`, `data-aos`,
    `IntersectionObserver` paired with opacity, `ScrollTrigger`.

16. **No cursor-following beam.** No spotlight, glow, or gradient that
    tracks the pointer. No `--mouse-x` decorative effects.
    *Check:* search for mouse-position CSS variables and `mousemove`
    handlers driving a gradient.

17. **Hover states change more than opacity.** A button that only fades on
    hover has no hover design. Hover shifts background, border, elevation,
    or transform: something with intent.
    *Check:* search for `hover:opacity` and `:hover { opacity: }` as the
    only hover treatment.

## Substance

18. **No untouched component-library defaults.** shadcn/ui, MUI, Chakra,
    DaisyUI are starting points, not the design. Stock primitives with the
    default radius, palette, and type are a finding even when they look
    fine.
    *Check:* diff the primitives against upstream. Confirm the theme
    actually extends fonts and colors.

19. **Differentiated, thought-out UI; never a slopped MVP. (render)** The
    surface shows decisions a template could not have made: a real identity,
    at least one considered signature choice, and none of the tells above.
    "It works" is not the bar. "It was designed" is. Marketing sites ship as
    real multi-page sites: home, product or features, pricing, about or
    contact at minimum, each designed, each with its own metadata. One long
    scroll with anchor links is not a multi-page site.
    *Check:* cover the logo. Is this recognizably its own product? Count
    real routes and confirm nav links resolve to pages, not fragments.

20. **Human copy, never AI-worded.** No em dashes in user-facing text; use
    commas, periods, colons, or parentheses. Copy sounds like a person who
    knows the product: specific, plain, varied sentence lengths. Banned on
    sight: Unlock, Seamless, Elevate, Supercharge, Empower, Effortless,
    Revolutionize, Game-changing, Cutting-edge, Unleash, "harness the power
    of", "take it to the next level", delve, "in today's fast-paced world",
    rule-of-three adjective triads, title case on every header, and
    exclamation-mark enthusiasm.
    *Check:* search for em and en dashes in copy and content files. Read
    every string aloud. Sweep the banned list.

## Surfaces

21. **No side drawers or slide-over panels. (render)** Nothing slides in
    from the edge of the viewport to show or edit a record: no sheets, no
    off-canvas panels, no "quick view" trays. A record is a real thing and
    gets its own page at its own address, the way a document does. The one
    exception is navigation on phones, where the rail may overlay. Modal
    dialogs remain for confirmation and short forms, centred, never anchored
    to an edge.
    *Check:* search for `inset-y-0` paired with `right-0` or `left-0` on
    anything but the navigation rail, and for `slide-in-from-right` or
    `slide-in-from-left`. Open a record in every app and confirm the URL
    changed.

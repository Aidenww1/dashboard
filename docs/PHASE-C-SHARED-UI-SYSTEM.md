# Phase C: Shared UI System

## Status

Phase C is complete. The production UI foundation now defines the visual, responsive, interaction, and accessibility contracts that later page redesign phases must use.

This phase does not redesign Today, Food, Body, or the remaining product pages. Page-specific visual parity starts in Phase D. No deployment, database migration, commit, push, or production data cutover was performed.

## Delivered

- Shared color, typography, spacing, density, chart, touch-target, radius, layout, and z-index tokens.
- Compact operational cards, metric cards, rows, badges, buttons, fields, steppers, switches, tables, chart frames, and responsive section layouts.
- Six-domain Log navigation with icons, one-row desktop/tablet behavior, and a stable 3-by-2 phone grid.
- Section navigation that remains fully visible and becomes a stable three-column phone grid.
- Responsive tables with sticky desktop headers and labeled phone rows.
- A dependency-free shared chart renderer with a visual SVG, accessible name, plain-language summary, point labels, and screen-reader data table.
- Empty, loading, error, stale, success, offline, disconnected, and sync-conflict states.
- Accessible sheets, dialogs, confirmations, menus, toasts, and recoverable Undo actions.
- Focus trapping, trigger-focus restoration, Escape handling, menu arrow/Home/End navigation, background scroll locking, and reduced-motion support.
- A searchable component reference at `ui/components.html`.

## Responsive Contracts

- Desktop uses the persistent sidebar and a constrained content canvas.
- Tablet switches to the five-item bottom navigation and a six-track grid, yielding readable two-column cards.
- Phone uses a single content column, stable 3-by-2 domain and section tab grids, stacked table rows, and touch targets of at least 44px.
- Tablet and phone content reserve bottom safe space so the fixed navigation never obscures the final action or row.
- Cards use an 8px radius and stable metric/chart/table dimensions.
- Document-level horizontal scrolling is prohibited.

## Accessibility Contracts

- Active destinations expose `aria-current="page"`.
- Tabs use `role="tab"`, `aria-selected`, roving `tabindex`, and arrow/Home/End keyboard navigation.
- Dialogs and sheets use `aria-modal`, explicit title relationships, initial focus, focus trapping, Escape dismissal, background hiding, and focus restoration.
- Menus use menu roles, safe text insertion, arrow/Home/End navigation, Escape dismissal, and trigger-focus restoration.
- Charts expose a named image, human-readable summary, point titles, and equivalent data table.
- Form errors use `aria-invalid` plus a described error message.
- Focus indicators and reduced-motion behavior are shared, not page-specific.

## Verification

The complete repository suite passes 32 suites and 743 checks with zero failures.

Focused Phase C coverage:

- `shared-ui-system.test.js`: 35 checks.
- `ui-contract.test.js`: 16 checks.
- `browser-components-qa.mjs`: five required viewports plus interaction tests.
- `node --check`: shared UI, shell, and browser QA scripts.

Chromium viewport results:

| Viewport | Overflow | Domain rows | Section rows | Navigation | Chart | Minimum state-card width |
| --- | --- | ---: | ---: | --- | --- | ---: |
| 1440x900 | None | 1 | 1 | Sidebar | 7/7 points | 282px |
| 1680x945 | None | 1 | 1 | Sidebar | 7/7 points | 342px |
| 1792x1024 | None | 1 | 1 | Sidebar | 7/7 points | 346px |
| 768x1024 | None | 1 | 1 | Bottom nav | 7/7 points | 351px |
| 390x844 | None | 2 | 2 | Bottom nav | 7/7 points | 366px |

All five runs reported:

- no clipped controls, labels, cards, or charts
- correct responsive navigation visibility
- complete chart summary and tabular fallback
- no bottom-navigation overlap at maximum scroll
- correct dialog focus containment and restoration
- correct menu keyboard navigation and restoration
- zero runtime, console, or network errors

## Reference Images

- `phase-c-screenshots/components-desktop-1440x900.png`
- `phase-c-screenshots/components-desktop-1680x945.png`
- `phase-c-screenshots/components-desktop-1792x1024.png`
- `phase-c-screenshots/components-tablet-768x1024.png`
- `phase-c-screenshots/components-tablet-768x1024-bottom.png`
- `phase-c-screenshots/components-phone-390x844.png`
- `phase-c-screenshots/components-phone-390x844-bottom.png`

## Defects Found During Visual QA

- The production content shorthand overrode the earlier tablet bottom safe area, allowing the fixed bottom navigation to cover final content.
- The production 12-column grid overrode the intended tablet six-track grid, squeezing state cards into unreadable four-column rows.
- Phone section navigation wrapped unevenly instead of using a deliberate three-column layout.
- The component reference had no favicon, causing an otherwise harmless browser 404.

Each issue was corrected in the shared layer and locked with deterministic assertions.

## Tooling Note

The in-app Browser plugin could not initialize because its Node kernel was denied traversal of `C:\Users\maila\AppData` by the Windows sandbox. Visual verification continued through the repository Chromium/CDP harness using the bundled Node 24 runtime. The resulting screenshots and checks are deterministic and stored in the workspace.

## Rollout Boundary

The shared system is ready for page adoption, but existing pages are not automatically visually complete merely because they import it. Phase D must apply these primitives to Today and Food, connect them to canonical events and shared projections, and prove empty, populated, loading, error, offline, desktop, tablet, and phone states before continuing to later domains.

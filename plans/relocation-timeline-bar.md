# Relocation Timeline Bar — Implementation Plan

## Overview
Add a horizontal relocation countdown/progress bar at the top of the dashboard (below the sticky header, before the summary sentence). The bar spans from **March 1, 2026** to **July 15, 2026** (ETA for relocation), divided into month segments, with a ✈️ plane icon that advances daily to show current progress.

## Visual Design

```
┌──────────────────────────────────────────────────────────────────────────┐
│  🛫 Mar          │    Apr         │    May         │    Jun     │  Jul 🏁│
│  ████████████✈️░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░│
│                  ↑ today                                                │
└──────────────────────────────────────────────────────────────────────────┘
```

### Key elements:
- **Full-width horizontal bar** inside a card-style container
- **Month divider lines** at Apr 1, May 1, Jun 1, Jul 1 boundaries
- **Month labels** above or below the bar at each month start
- **Gradient fill** from left up to today's position — using the app's blue-to-purple gradient
- **Unfilled portion** in light gray
- **✈️ plane icon** positioned at today's exact date, sitting on top of the bar
- **Start marker** — 🛫 or label "Start" at the left edge
- **End marker** — 🏁 or "Arrival" label at the right edge with "Jul 15" date
- **Percentage label** showing "X% of journey complete" or "X days remaining"

## Technical Implementation

### 1. HTML — [`index.html`](index.html)

Add a new `<section>` with id `relocation-timeline` inside `<main id="dashboard">`, placed as the **first child** before the summary sentence section.

```html
<section class="relocation-timeline-section" id="relocation-timeline">
    <div class="relo-timeline-header">
        <span class="relo-timeline-title">🛫 Relocation Journey</span>
        <span class="relo-timeline-info" id="relo-timeline-info"></span>
    </div>
    <div class="relo-timeline-bar-wrapper">
        <div class="relo-timeline-months" id="relo-timeline-months">
            <!-- Month labels rendered by JS -->
        </div>
        <div class="relo-timeline-track">
            <div class="relo-timeline-fill" id="relo-timeline-fill"></div>
            <div class="relo-timeline-plane" id="relo-timeline-plane">✈️</div>
            <div class="relo-timeline-end-marker">🏁</div>
        </div>
        <div class="relo-timeline-dividers" id="relo-timeline-dividers">
            <!-- Month divider lines rendered by JS -->
        </div>
    </div>
</section>
```

### 2. CSS — [`css/styles.css`](css/styles.css)

New styles for the `.relocation-timeline-section`:

- **Container**: card-bg, rounded corners, shadow, padding — consistent with existing cards
- **Track**: full-width bar with rounded ends, light gray background
- **Fill**: gradient from blue to purple, width set dynamically via JS
- **Plane icon**: absolutely positioned on the track, `left` set by JS as percentage, with a subtle bounce/float animation
- **Month labels**: flex row with proportional widths matching actual month durations
- **Divider lines**: thin vertical lines at month boundaries, positioned absolutely
- **Responsive**: stacks gracefully on mobile

### 3. JavaScript — [`js/app.js`](js/app.js)

New function `updateRelocationTimeline()`:

1. **Constants**: `RELO_START = new Date(2026, 2, 1)` (Mar 1), `RELO_END = new Date(2026, 6, 15)` (Jul 15)
2. **Calculate progress**: `percentage = (today - start) / (end - start) * 100`, clamped to 0–100
3. **Calculate days remaining**: `daysLeft = Math.ceil((end - today) / 86400000)`
4. **Set fill width**: `relo-timeline-fill.style.width = percentage + '%'`
5. **Set plane position**: `relo-timeline-plane.style.left = percentage + '%'`
6. **Render month labels** with proportional widths based on actual days in each month segment
7. **Render divider lines** at the correct percentage positions for Apr 1, May 1, Jun 1, Jul 1
8. **Update info text**: e.g., "Day 15 of 136 — 89% remaining — 121 days to go"
9. **Call from** [`renderDashboard()`](js/app.js:479) — add `updateRelocationTimeline()` as the first call

### Month width calculations

| Segment | Date Range | Days | % of Total |
|---------|-----------|------|-----------|
| March | Mar 1 – Mar 31 | 31 | 22.8% |
| April | Apr 1 – Apr 30 | 30 | 22.1% |
| May | May 1 – May 31 | 31 | 22.8% |
| June | Jun 1 – Jun 30 | 30 | 22.1% |
| July | Jul 1 – Jul 15 | 15 | 11.0% |
| **Total** | | **136** (Mar 1 to Jul 15 inclusive is 137 days) | |

*Note: Total span = Jul 15 - Mar 1 = 136 days. Percentages for divider positions are calculated as days-from-start / 136.*

### Divider positions (percentage from left)

| Boundary | Days from Mar 1 | Percentage |
|----------|----------------|-----------|
| Apr 1 | 31 | 22.8% |
| May 1 | 61 | 44.9% |
| Jun 1 | 92 | 67.6% |
| Jul 1 | 122 | 89.7% |

## Files to Modify

| File | Change |
|------|--------|
| [`index.html`](index.html) | Add timeline section HTML as first child of `#dashboard` |
| [`css/styles.css`](css/styles.css) | Add `.relocation-timeline-*` styles |
| [`js/app.js`](js/app.js) | Add `updateRelocationTimeline()` function, call it from `renderDashboard()` |

## Edge Cases
- **Before March 1**: plane at 0%, show "Starts in X days"
- **After July 15**: plane at 100%, show "You've arrived! 🎉"
- **Today (Mar 15)**: plane at ~10.3% (14/136)

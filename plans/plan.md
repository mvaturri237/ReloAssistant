# ReloAssistant — Relocation Tracking Dashboard

## Overview
A simple web dashboard to track relocation tasks for Maor & Omer's family move to California (L1 visa).

## Architecture
```
Google Sheet → Manual CSV Export → Dashboard (localhost)
```

## Google Sheet Setup

### Step 1: Create the Sheet
1. Go to [Google Sheets](https://sheets.google.com) and create a new spreadsheet
2. Name it **"Relocation Tracker"**
3. Create the following column headers in Row 1:

| Column | Header |
|--------|--------|
| A | Category |
| B | Task |
| C | Assignee |
| D | Priority |
| E | Status |
| F | ETA |
| G | Notes |

### Step 2: Add Data Validation (Dropdowns)

For each column that needs a dropdown:

1. **Category (Column A)**: Select A2:A1000 → Data → Data Validation → Dropdown → Add values:
   - Visa/Immigration
   - Housing
   - Banking/Finance
   - Healthcare
   - Kids/School
   - Shipping/Moving
   - Utilities
   - DMV/Driving
   - General

2. **Assignee (Column C)**: Select C2:C1000 → Data → Data Validation → Dropdown → Add values:
   - Maor
   - Omer

3. **Priority (Column D)**: Select D2:D1000 → Data → Data Validation → Dropdown → Add values:
   - High
   - Medium
   - Low

4. **Status (Column E)**: Select E2:E1000 → Data → Data Validation → Dropdown → Add values:
   - Not Started
   - In Progress
   - Done
   - Blocked

5. **ETA (Column F)**: Select F2:F1000 → Format → Number → Date (YYYY-MM-DD format preferred)

### Step 3: Export as CSV
1. File → Download → Comma Separated Values (.csv)
2. Upload the CSV to the dashboard

## Dashboard Features
- CSV drag-and-drop upload
- Summary cards (total tasks, completion %, per assignee, overdue)
- Filterable task table
- Status pie chart + category bar chart
- Overdue task highlighting
- localStorage persistence

## Tech Stack
- HTML + CSS + Vanilla JS (no build tools)
- Chart.js (CDN) — charts
- PapaParse (CDN) — CSV parsing

# 🏠 ReloAssistant

A simple, clean dashboard to track relocation tasks for your move to California.

## Quick Start

1. **Open the dashboard**: Open `index.html` in your browser (or use a local server)
2. **Upload your CSV**: Drag and drop your CSV file onto the dashboard, or click "Upload CSV"
3. **Track your progress**: View summary cards, charts, and the full task table

## Using with Google Sheets

1. Create a Google Sheet with these columns:
   - **Category** — e.g., Visa/Immigration, Housing, Banking/Finance, etc.
   - **Task** — Description of the task
   - **Assignee** — Maor or Omer
   - **Priority** — High, Medium, or Low
   - **Status** — Not Started, In Progress, Done, or Blocked
   - **ETA** — Target date (YYYY-MM-DD format)
   - **Notes** — Optional notes

2. Export: **File → Download → Comma Separated Values (.csv)**

3. Upload the CSV to the dashboard

See [plans/plan.md](plans/plan.md) for detailed Google Sheet setup instructions with data validation.

## Features

- 📊 **Summary Cards** — Total tasks, completion %, tasks per assignee, overdue & blocked counts
- 📈 **Progress Bar** — Visual overall completion tracker
- 🍩 **Status Chart** — Doughnut chart showing task status distribution
- 📊 **Category Chart** — Stacked bar chart showing progress by category
- 👥 **Assignee View** — Individual progress for Maor and Omer
- 🔍 **Filters** — Filter by category, assignee, priority, and status
- 🔄 **Sorting** — Click column headers to sort the task table
- ⚠️ **Overdue Highlighting** — Tasks past their ETA are highlighted in red
- 💾 **Persistence** — Data is saved in localStorage (survives page refresh)

## Testing with Sample Data

A sample CSV file is included at `data/sample.csv` for testing purposes.

## Running Locally

Simply open `index.html` in your browser. For the best experience, use a local server:

```bash
# Python 3
python3 -m http.server 8080

# Then open http://localhost:8080
```

## Project Structure

```
ReloAssistant/
├── index.html          # Main dashboard page
├── css/
│   └── styles.css      # All styling
├── js/
│   └── app.js          # Dashboard logic
├── data/
│   └── sample.csv      # Sample data for testing
├── plans/
│   └── plan.md         # Project plan & Google Sheet setup guide
└── README.md           # This file
```

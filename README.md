# KKU Plan Tools

A lightweight Chrome extension (Manifest V3) that adds four one-click tools to **KKU Plan CS** pages: reveal hidden table rows, extract offered courses as JSON, send your study plan to the [kku-plan-cs](https://kku-plan-cs.netlify.app/) web app, and export a timetable straight to Excel.

No tracking, no external servers, no analytics — everything runs locally in your browser using `chrome.scripting`.

## Features

| Button | What it does |
| --- | --- |
| **Show all hidden rows** | Forces every `<tr>` on the page back to visible, revealing rows the site hides by default. |
| **Open Plan in kku-plan-cs** | Reads your study plan table, base64-encodes it, and opens `kku-plan-cs.netlify.app` with your plan pre-loaded via the `?JsonC=` parameter. |
| **Extract Courses Offered (JSON)** | Scrapes the *Offered Courses* table — including instructor, section data, and exam period hidden in input fields — and downloads it as `offered_courses_full.json`. |
| **Export scheduleTreeCoursesIndex** | Injects [SheetJS](https://sheetjs.com/) and exports the timetable table to `timetable_courses.xlsx`, with section day/time/room parsed into separate columns. |

The Excel export produces these columns (Arabic headers, matching the source pages):

`رمز المقرر` · `اسم المقرر` · `الشعبة` · `النشاط` · `الساعات` · `الجنس` · `الحالة` · `المحاضر` · `الأيام` · `الوقت` · `القاعة` · `تفاصيل الشعبة (خام)`

## Installation

This extension is not published on the Chrome Web Store — load it manually in developer mode.

1. Download this repository (**Code → Download ZIP**) or grab `kku_plan.zip` from the repo and extract it.
2. Open `chrome://extensions` in Chrome (or any Chromium browser: Edge, Brave, Opera).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Pin **KKU Plan Tools** to the toolbar.

## Usage

1. Navigate to a KKU Plan CS page containing a plan or offered-courses table.
2. Click the extension icon, then click the button you need.
3. A status line at the bottom of the popup reports success or the exact error.

> The **Export to Excel** button injects the bundled XLSX library into the page first, so no internet connection is required for the export.

## Project structure

```
manifest.json        Extension manifest (MV3)
popup.html           Popup UI + styling
popup.js             All extension logic and injected page functions
xlsx.full.min.js     SheetJS library, vendored for offline Excel export
kku_plan.zip         Pre-packaged build of the four files above (ready to load)
```

## How it works

`popup.js` runs in the popup context and uses `chrome.scripting.executeScript` to inject functions into the active tab:

- `getCoursesArray()` parses `#myFrm:allPlanList`, deriving each course's status from the row's CSS class (`TAKEN`, `TAKEN_NOW`, `NOT_TAKEN`).
- `extractFullCourses()` walks `#myForm:offeredCoursesTable`, using each cell's `data-th` attribute as the JSON key and pulling hidden values out of the `:instructor`, `:section`, and `:examPeriod` inputs.
- `exportTimetableToExcel()` reads `#myForm:timetable` and splits the raw section string (`@t`, `@r`, `@n` markers) into separate day, time, and room fields.

## Notes & limitations

- The extension needs the `activeTab` and `scripting` permissions only; it requests no host permissions and reads nothing until you click a button.
- It targets the specific element IDs used by KKU Plan CS pages. If the site changes those IDs, the affected button will report "not found".
- Arabic text is handled as UTF-8; exports open correctly in Excel and Google Sheets.

## License

Released under the [MIT License](LICENSE).

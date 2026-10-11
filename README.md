# KKU Plan Tools

A lightweight Chrome extension (Manifest V3) that adds four one-click tools to **KKU Plan CS** pages: reveal hidden table rows, extract offered courses as JSON, send your study plan to the [kku-plan-cs](https://kku-plan-cs.netlify.app/) web app, and export a timetable straight to Excel.

No tracking, no external servers, no analytics — everything runs locally in your browser using `chrome.scripting`.

## Features

| Button | What it does |
| --- | --- |
| **Show all hidden rows** | Forces every `<tr>` on the page back to visible, revealing rows the site hides by default. |
| **Open Plan in kku-plan-cs** | Navigates the active tab to the KKU study-plan page, waits for the page and course rows to load, then opens `kku-plan-cs.netlify.app` with your plan pre-loaded via the `?JsonC=` parameter. |
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

For **Open Plan in kku-plan-cs**, you can start from any tab. The extension navigates that tab to [the KKU study-plan page](https://registration.kku.edu.sa/kku/ui/student/student_plan/index/forwardAllPlanIndex.faces). It waits for the page to finish loading and for nonempty course rows to remain stable for half a second, then opens the imported plan in a new tab. The transfer continues if the popup closes. If KKU asks you to sign in, sign in and return to the study-plan page within five minutes. The extension allows 30 seconds for the page and course table to load once you reach it; failures appear in the extension badge and in the popup when reopened. Click the button again to retry.

> The **Export to Excel** button injects the bundled XLSX library into the page first, so no internet connection is required for the export.

## Project structure

```
manifest.json        Extension manifest (MV3)
popup.html           Popup UI + styling
popup.js             Popup actions and offered-course / Excel page functions
background.js        Persists the transfer request, navigates, and opens the imported plan
plan.js              Waits for the KKU study-plan page and extracts its course rows
xlsx.full.min.js     SheetJS library, vendored for offline Excel export
kku_plan.zip         Pre-packaged extension build (ready to load)
```

## How it works

`popup.js` runs in the popup context and uses `chrome.scripting.executeScript` for the offered-course and Excel tools. Plan transfers instead use a background worker and a content script scoped to the KKU study-plan page:

- `background.js` stores pending transfers in `chrome.storage.session` before navigation, so closing the popup or restarting the service worker does not lose the request. Only a requested transfer can open a plan.
- `plan.js` waits for `document.readyState === 'complete'` and stable course rows. Its `getCoursesArray()` parses `#myFrm:allPlanList`, deriving each course's status from the row's CSS class (`TAKEN`, `TAKEN_NOW`, `NOT_TAKEN`). The background worker encodes Arabic as UTF-8 and escapes the base64 query parameter.
- `extractFullCourses()` walks `#myForm:offeredCoursesTable`, using each cell's `data-th` attribute as the JSON key and pulling hidden values out of the `:instructor`, `:section`, and `:examPeriod` inputs.
- `exportTimetableToExcel()` reads `#myForm:timetable` and splits the raw section string (`@t`, `@r`, `@n` markers) into separate day, time, and room fields.

## Notes & limitations

- The extension uses `activeTab` and `scripting` for the other tools, plus `storage` to retain transfer requests. Its content script runs only on the KKU study-plan URL and extracts data only after you click **Open Plan in kku-plan-cs**.
- It targets the specific element IDs used by KKU Plan CS pages. If the site changes those IDs, the affected button will report "not found".
- Arabic text is handled as UTF-8; exports open correctly in Excel and Google Sheets.

## License

Released under the [MIT License](LICENSE).

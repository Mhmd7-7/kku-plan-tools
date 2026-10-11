const statusEl = document.getElementById('status');
const revealBtn = document.getElementById('revealBtn');
const extractBtn = document.getElementById('extractBtn');
const fullExtractBtn = document.getElementById('fullExtractBtn');
const exportExcelBtn = document.getElementById('exportExcelBtn');

function setStatus(msg, type = 'info') {
  statusEl.textContent = msg;
  statusEl.className = 'status-' + type;
}

// ─── Reveal hidden rows ──────────────────────────────────────────────
revealBtn.addEventListener('click', async () => {
  setStatus('Working…', 'info');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { setStatus('No active tab found.', 'error'); return; }
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const rows = document.querySelectorAll('tr');
        rows.forEach(tr => { tr.style.display = ''; });
        return rows.length;
      }
    });
    const count = results[0]?.result || 0;
    setStatus(`✅ Done – checked ${count} row(s).`, 'success');
  } catch (err) {
    setStatus(`❌ Error: ${err.message}`, 'error');
  }
});

// ─── Open in kku-plan-cs ─────────────────────────────────────────────
extractBtn.addEventListener('click', async () => {
  extractBtn.disabled = true;
  setStatus('Opening KKU study plan…', 'info');
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('No active tab found.');
    const response = await chrome.runtime.sendMessage({
      type: 'START_PLAN_TRANSFER', tabId: tab.id
    });
    if (!response?.ok) throw new Error(response?.error || 'Could not open the study plan.');
    setStatus(response.message, 'info');
  } catch (err) {
    setStatus(`❌ Error: ${err.message}`, 'error');
  } finally {
    extractBtn.disabled = false;
  }
});

// Restore the outcome when the popup is reopened after navigation.
async function restorePlanStatus() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    const response = await chrome.runtime.sendMessage({ type: 'GET_PLAN_STATUS', tabId: tab.id });
    if (response?.job && statusEl.textContent === 'Ready') {
      setStatus(response.job.message, response.job.status);
    }
  } catch {
    // Other tools remain usable if no transfer status is available.
  }
}
restorePlanStatus();

// ─── Extract JSON (full) ─────────────────────────────────────────────
fullExtractBtn.addEventListener('click', async () => {
  setStatus('Extracting full courses…', 'info');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { setStatus('No active tab found.', 'error'); return; }
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: extractFullCourses
    });
    setStatus('✅ JSON download triggered.', 'success');
  } catch (err) {
    setStatus(`❌ Error: ${err.message}`, 'error');
  }
});

// ─── Export to Excel ─────────────────────────────────────────────────
exportExcelBtn.addEventListener('click', async () => {
  setStatus('Loading XLSX library…', 'info');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) { setStatus('No active tab found.', 'error'); return; }

  try {
    // 1. Inject the XLSX library (from the extension's local file)
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['xlsx.full.min.js']
    });

    // 2. Now execute the export function (it will use window.XLSX)
    setStatus('Extracting timetable data…', 'info');
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: exportTimetableToExcel
    });

    setStatus('✅ Excel download triggered.', 'success');
  } catch (err) {
    setStatus(`❌ Error: ${err.message}`, 'error');
  }
});

// ─── Page‑context functions ─────────────────────────────────────────

function extractFullCourses() {
  (function() {
    const table = document.getElementById('myForm:offeredCoursesTable');
    if (!table) {
      console.error('Table not found.');
      return;
    }
    const rows = table.querySelectorAll('tbody tr');
    const courses = [];
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      const course = {};
      cells.forEach(cell => {
        const key = cell.getAttribute('data-th');
        if (key) {
          let value = cell.textContent.trim();
          course[key.trim()] = value;
        }
      });
      const detailsCell = row.querySelector('td[data-th="التفاصيل"]');
      if (detailsCell) {
        const anchor = detailsCell.querySelector('a');
        if (anchor) {
          const instructorInput = anchor.querySelector('input[id$=":instructor"]');
          const sectionInput = anchor.querySelector('input[id$=":section"]');
          const examPeriodInput = anchor.querySelector('input[id$=":examPeriod"]');
          course['instructor'] = instructorInput ? instructorInput.value : 'غير محدد';
          course['sectionData'] = sectionInput ? sectionInput.value : '';
          course['examPeriod'] = examPeriodInput ? examPeriodInput.value : '';
        }
      }
      if (course['رمز المقرر']) {
        courses.push(course);
      }
    });
    const jsonString = JSON.stringify(courses, null, 2);
    console.log('Extracted JSON with hidden details:');
    console.log(jsonString);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'offered_courses_full.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return courses;
  })();
}

// ─── Export timetable to Excel (no CDN loading) ────────────────────
function exportTimetableToExcel() {
  // This function runs in the page context. XLSX is already injected.
  function parseSectionDetails(raw) {
    if (!raw) return { days: '', time: '', room: '' };
    const dayMatch = raw.match(/^[\s]*([\d\s]+?)\s*@t/);
    const days = dayMatch ? dayMatch[1].trim() : '';
    const timeMatch = raw.match(/@t\s+([^@]+?)\s+@r/);
    const time = timeMatch ? timeMatch[1].trim() : '';
    const roomMatch = raw.match(/@r\s+(.+?)(?:\s*@n|$)/);
    const room = roomMatch ? roomMatch[1].trim() : '';
    return { days, time, room };
  }

  const table = document.getElementById('myForm:timetable');
  if (!table) {
    console.error('Table not found.');
    return;
  }

  const rows = table.querySelectorAll('tbody tr');
  if (rows.length === 0) {
    console.error('No rows found.');
    return;
  }

  const data = [];
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    if (cells.length < 8) return;
    const courseCode = cells[0].textContent.trim();
    const courseName = cells[1].textContent.trim();
    const section = cells[2].textContent.trim();
    const activity = cells[3].textContent.trim();
    const hours = cells[4].textContent.trim();
    const gender = cells[5].textContent.trim();
    const status = cells[6].textContent.trim();

    const detailsCell = cells[7];
    let instructor = '';
    let sectionRaw = '';
    const instructorInput = detailsCell.querySelector('input[id$=":instructor"]');
    const sectionInput = detailsCell.querySelector('input[id$=":section"]');
    if (instructorInput) instructor = instructorInput.value.trim();
    if (sectionInput) sectionRaw = sectionInput.value.trim();
    const parsed = parseSectionDetails(sectionRaw);

    data.push({
      'رمز المقرر': courseCode,
      'اسم المقرر': courseName,
      'الشعبة': section,
      'النشاط': activity,
      'الساعات': hours,
      'الجنس': gender,
      'الحالة': status,
      'المحاضر': instructor,
      'الأيام': parsed.days,
      'الوقت': parsed.time,
      'القاعة': parsed.room,
      'تفاصيل الشعبة (خام)': sectionRaw
    });
  });

  if (data.length === 0) {
    console.error('No data extracted.');
    return;
  }

  // XLSX is available globally (injected by the extension)
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(data);
  ws['!cols'] = [
    { wch: 16 }, { wch: 24 }, { wch: 10 }, { wch: 12 },
    { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 22 },
    { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 40 }
  ];
  XLSX.utils.book_append_sheet(wb, ws, 'المقررات المطروحة');
  XLSX.writeFile(wb, 'timetable_courses.xlsx');
  console.log('✅ Excel exported:', data.length, 'courses');
}

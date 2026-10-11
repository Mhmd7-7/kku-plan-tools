// Runs only on the KKU study-plan page, independently of the extension popup.
function getCoursesArray() {
  const allPlanList = document.getElementById('myFrm:allPlanList');
  if (!allPlanList) return [];
  const courses = [];
  const rows = allPlanList.querySelectorAll('table[id$="coursesPlan"] tbody tr');
  rows.forEach(row => {
    const span = row.querySelector('td:first-child span');
    const courseCode = span ? span.innerText.trim() : '';
    if (!courseCode) return;
    let status = '';
    if (row.classList.contains('TAKEN')) status = 'TAKEN';
    else if (row.classList.contains('TAKEN_NOW')) status = 'TAKEN_NOW';
    else if (row.classList.contains('NOT_TAKEN')) status = 'NOT_TAKEN';
    courses.push({ courseCode, status });
  });
  return courses;
}

function waitForPlanCourses(timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let lastSnapshot = '';
    let stableSince = startedAt;
    const timer = setInterval(() => {
      const courses = document.readyState === 'complete' ? getCoursesArray() : [];
      const snapshot = JSON.stringify(courses);
      if (snapshot !== lastSnapshot) {
        lastSnapshot = snapshot;
        stableSince = Date.now();
      }
      // Wait for actual rows, including tables filled after the page load event.
      if (courses.length && Date.now() - stableSince >= 500) {
        clearInterval(timer);
        resolve(courses);
      } else if (Date.now() - startedAt >= timeoutMs) {
        clearInterval(timer);
        reject(new Error('Study plan did not finish loading within 30 seconds. Sign in to KKU and try again.'));
      }
    }, 250);
  });
}

async function runPlanTransfer() {
  const response = await chrome.runtime.sendMessage({ type: 'PLAN_PAGE_READY' });
  // Visiting this page normally never starts a transfer.
  if (!response?.ok) return;
  let result;
  try {
    result = { courses: await waitForPlanCourses() };
  } catch (err) {
    result = { error: err.message };
  }
  await chrome.runtime.sendMessage({ type: 'PLAN_RESULT', token: response.token, ...result });
}

runPlanTransfer().catch(err => console.error('KKU Plan Tools:', err.message));

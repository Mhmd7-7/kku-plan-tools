const PLAN_URL = 'https://registration.kku.edu.sa/kku/ui/student/student_plan/index/forwardAllPlanIndex.faces';
const JOB_TTL_MS = 5 * 60 * 1000;
const jobKey = tabId => `planTransfer:${tabId}`;

async function getJob(tabId) {
  return (await chrome.storage.session.get(jobKey(tabId)))[jobKey(tabId)];
}

async function saveJob(tabId, job) {
  await chrome.storage.session.set({ [jobKey(tabId)]: job });
  await chrome.action.setBadgeText({ tabId, text: job.status === 'success' ? '✓' : job.status === 'error' ? '!' : '…' });
  await chrome.action.setTitle({ tabId, title: `KKU Plan Tools: ${job.message}` });
}

function isPlanPage(url) {
  if (!url) return false;
  const actual = new URL(url);
  const expected = new URL(PLAN_URL);
  return actual.origin === expected.origin && actual.pathname === expected.pathname;
}

function utf8ToBase64(str) {
  let binary = '';
  for (const byte of new TextEncoder().encode(str)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

async function handleMessage(message, sender) {
  if (message.type === 'START_PLAN_TRANSFER') {
    const tabId = message.tabId;
    if (!Number.isInteger(tabId)) throw new Error('No active tab found.');
    const previous = await getJob(tabId);
    if (previous?.status === 'info' && Date.now() - previous.startedAt < JOB_TTL_MS) {
      return { ok: true, message: previous.message };
    }
    const job = {
      status: 'info', startedAt: Date.now(),
      message: 'Waiting for the KKU plan. If asked, sign in; the plan will open automatically.'
    };
    // Save before navigating: the popup can close and the worker can restart.
    await saveJob(tabId, job);
    try {
      await chrome.tabs.update(tabId, { url: PLAN_URL });
    } catch (err) {
      await saveJob(tabId, { ...job, status: 'error', message: err.message });
      throw err;
    }
    return { ok: true, message: job.message };
  }

  if (message.type === 'GET_PLAN_STATUS') {
    const job = await getJob(message.tabId);
    if (job?.status === 'info' && Date.now() - job.startedAt >= JOB_TTL_MS) {
      job.status = 'error';
      job.message = 'Plan request expired. Click Open Plan again.';
      await saveJob(message.tabId, job);
    }
    return { job };
  }

  const tabId = sender.tab?.id;
  if (!Number.isInteger(tabId) || !isPlanPage(sender.url)) return { ok: false };
  const job = await getJob(tabId);
  if (!job || job.status !== 'info') return { ok: false };
  if (Date.now() - job.startedAt >= JOB_TTL_MS) {
    await saveJob(tabId, { ...job, status: 'error', message: 'Plan request expired. Click Open Plan again.' });
    return { ok: false };
  }

  if (message.type === 'PLAN_PAGE_READY') {
    const token = crypto.randomUUID();
    await saveJob(tabId, { ...job, token, message: 'Waiting for the study plan table to finish loading…' });
    return { ok: true, token };
  }

  if (message.type === 'PLAN_RESULT' && message.token === job.token) {
    if (message.error || !Array.isArray(message.courses) || !message.courses.length) {
      await saveJob(tabId, { ...job, status: 'error', message: message.error || 'No courses found in the study plan.' });
      return { ok: false };
    }
    const url = new URL('https://kku-plan-cs.netlify.app/');
    url.searchParams.set('JsonC', utf8ToBase64(JSON.stringify(message.courses)));
    // Claim the result before opening, so a repeated result cannot open two tabs.
    await saveJob(tabId, { ...job, status: 'success', message: `Opened with ${message.courses.length} course(s).` });
    try {
      const opened = await chrome.tabs.create({ url: url.href });
      await saveJob(opened.id, { ...job, status: 'success', message: `Opened with ${message.courses.length} course(s).` });
    } catch (err) {
      await saveJob(tabId, { ...job, status: 'error', message: err.message });
      throw err;
    }
    return { ok: true };
  }
  return { ok: false };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse, err => sendResponse({ ok: false, error: err.message }));
  return true;
});

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(jobKey(tabId));
});

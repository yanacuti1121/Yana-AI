'use strict';
// Tests for connector-google-adapters.js's data-shaping logic, using a
// fake requestJson (dependency-injected, same pattern as connector-
// registry.js's own exec = execFile default) — no real network call, no
// live Google credentials needed. What this does NOT cover: whether the
// real Gmail/Calendar REST APIs actually respond the way these fixtures
// assume — that only a live, logged-in run can confirm.
// Run: node _test_connector_google_adapters.js   (exit 0 = pass, 1 = fail)

const { fetchGmailMessages, fetchCalendarEvents, fetchDriveFiles } = require('./connector-google-adapters');

let pass = 0, fail = 0;
function t(name, cond) {
  if (cond) { pass++; console.log('PASS  ' + name); }
  else      { fail++; console.log('FAIL  ' + name); }
}

async function run() {
  // ── Gmail: happy path ───────────────────────────────────────────────────
  {
    const calls = [];
    const fakeRequest = async (options) => {
      calls.push(options.path);
      if (options.path.includes('/messages?')) {
        return { status: 200, body: { messages: [{ id: 'm1' }, { id: 'm2' }] } };
      }
      const id = options.path.match(/messages\/([^?]+)/)[1];
      return {
        status: 200,
        body: {
          id, threadId: `t-${id}`, snippet: `snippet for ${id}`,
          labelIds: id === 'm1' ? ['UNREAD', 'INBOX'] : ['INBOX'],
          payload: { headers: [
            { name: 'Subject', value: `Subject ${id}` },
            { name: 'From', value: 'sender@example.com' },
            { name: 'Date', value: 'Mon, 1 Sep 2026 00:00:00 +0000' },
          ] },
        },
      };
    };
    const result = await fetchGmailMessages({ accessToken: 'tok', limit: 5, requestJson: fakeRequest });
    t('gmail: ok=true on 200s', result.ok === true);
    t('gmail: returns both messages', result.messages.length === 2);
    t('gmail: subject header extracted', result.messages[0].subject === 'Subject m1');
    t('gmail: unread flag reflects UNREAD label', result.messages[0].unread === true && result.messages[1].unread === false);
    t('gmail: limit is capped into the list request', calls[0].includes('maxResults=5'));
  }

  // ── Gmail: expired token ────────────────────────────────────────────────
  {
    const result = await fetchGmailMessages({ accessToken: 'stale', requestJson: async () => ({ status: 401, body: {} }) });
    t('gmail: 401 reports expired, not a generic error', result.ok === false && result.expired === true);
  }

  // ── Gmail: limit is bounded, never trusts caller's raw number ──────────
  {
    let seenPath = '';
    const fakeRequest = async (options) => {
      if (!seenPath) seenPath = options.path;
      return { status: 200, body: { messages: [] } };
    };
    await fetchGmailMessages({ accessToken: 'tok', limit: 9999, requestJson: fakeRequest });
    t('gmail: absurd limit is clamped to the max, not passed through', seenPath.includes('maxResults=25'));
  }

  // ── Calendar: happy path ────────────────────────────────────────────────
  {
    const fakeRequest = async () => ({
      status: 200,
      body: { items: [
        { id: 'e1', summary: 'Standup', start: { dateTime: '2026-09-01T09:00:00Z' }, end: { dateTime: '2026-09-01T09:15:00Z' }, location: 'Room A', htmlLink: 'https://x' },
        { id: 'e2', start: { date: '2026-09-02' }, end: { date: '2026-09-03' } }, // all-day, no summary
      ] },
    });
    const result = await fetchCalendarEvents({ accessToken: 'tok', requestJson: fakeRequest });
    t('calendar: ok=true on 200', result.ok === true);
    t('calendar: dateTime events use dateTime, not date', result.events[0].start === '2026-09-01T09:00:00Z');
    t('calendar: all-day events fall back to date', result.events[1].start === '2026-09-02');
    t('calendar: missing summary does not crash, gets a placeholder', result.events[1].summary === '(no title)');
  }

  // ── Calendar: expired token ─────────────────────────────────────────────
  {
    const result = await fetchCalendarEvents({ accessToken: 'stale', requestJson: async () => ({ status: 401, body: {} }) });
    t('calendar: 401 reports expired', result.ok === false && result.expired === true);
  }

  // ── Drive: happy path ───────────────────────────────────────────────────
  {
    let seenPath = '';
    const fakeRequest = async (options) => {
      seenPath = options.path;
      return {
        status: 200,
        body: { files: [
          { id: 'f1', name: 'Q3 plan.docx', mimeType: 'application/vnd.google-apps.document', modifiedTime: '2026-09-01T09:00:00Z', webViewLink: 'https://drive/f1', iconLink: 'https://icon/f1' },
          { id: 'f2', mimeType: 'application/pdf' }, // missing name/modifiedTime/links
        ] },
      };
    };
    const result = await fetchDriveFiles({ accessToken: 'tok', limit: 5, requestJson: fakeRequest });
    t('drive: ok=true on 200', result.ok === true);
    t('drive: returns both files', result.files.length === 2);
    t('drive: name/link fields carried through', result.files[0].name === 'Q3 plan.docx' && result.files[0].webViewLink === 'https://drive/f1');
    t('drive: missing name does not crash, gets a placeholder', result.files[1].name === '(untitled)');
    t('drive: excludes trashed items server-side via q= param', seenPath.includes('trashed'));
    t('drive: limit is capped into the list request', seenPath.includes('pageSize=5'));
  }

  // ── Drive: expired token ────────────────────────────────────────────────
  {
    const result = await fetchDriveFiles({ accessToken: 'stale', requestJson: async () => ({ status: 401, body: {} }) });
    t('drive: 401 reports expired', result.ok === false && result.expired === true);
  }

  // ── Drive: limit is bounded, never trusts caller's raw number ──────────
  {
    let seenPath = '';
    const fakeRequest = async (options) => { seenPath = options.path; return { status: 200, body: { files: [] } }; };
    await fetchDriveFiles({ accessToken: 'tok', limit: 9999, requestJson: fakeRequest });
    t('drive: absurd limit is clamped to the max, not passed through', seenPath.includes('pageSize=25'));
  }

  // ── Neither adapter ever throws on a malformed upstream body ────────────
  {
    const gmailResult = await fetchGmailMessages({ accessToken: 'tok', requestJson: async () => ({ status: 200, body: {} }) });
    t('gmail: missing "messages" key returns empty list, not a crash', gmailResult.ok === true && gmailResult.messages.length === 0);

    const calResult = await fetchCalendarEvents({ accessToken: 'tok', requestJson: async () => ({ status: 200, body: {} }) });
    t('calendar: missing "items" key returns empty list, not a crash', calResult.ok === true && calResult.events.length === 0);

    const driveResult = await fetchDriveFiles({ accessToken: 'tok', requestJson: async () => ({ status: 200, body: {} }) });
    t('drive: missing "files" key returns empty list, not a crash', driveResult.ok === true && driveResult.files.length === 0);
  }

  console.log('\nResult: ' + pass + ' pass, ' + fail + ' fail');
  process.exit(fail ? 1 : 0);
}

run().catch((err) => { console.error('UNCAUGHT', err); process.exit(1); });

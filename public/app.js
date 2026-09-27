const byId = (id) => document.getElementById(id);

async function request(url, options = {}) {
  let response;
  try { response = await fetch(url, options); } catch {
    throw new Error('Unable to reach the API. Check your connection and try again.');
  }
  let data;
  try { data = await response.json(); } catch {
    throw new Error(`The server returned an unexpected response (${response.status}).`);
  }
  if (!response.ok) throw new Error(data.error?.message || `Request failed (${response.status}).`);
  return data;
}

function feedback(id, message, type = '') {
  const target = byId(id);
  target.textContent = message;
  target.className = `feedback ${type}`;
}

async function withLoading(button, statusId, task) {
  if (button.disabled) return;
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Loading...';
  feedback(statusId, 'Loading...');
  try { await task(); } catch (error) {
    feedback(statusId, error.message, 'error');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function date(value, includeTime = false) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return includeTime
    ? parsed.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : parsed.toLocaleDateString(undefined, { dateStyle: 'medium', timeZone: 'UTC' });
}

function table(headers, rows, label) {
  const wrap = element('div', undefined, 'table-wrap');
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'region');
  wrap.setAttribute('aria-label', label);
  const result = element('table');
  const head = element('thead');
  const heading = element('tr');
  headers.forEach((title) => { const cell = element('th', title); cell.scope = 'col'; heading.append(cell); });
  head.append(heading);
  const body = element('tbody');
  rows.forEach((values) => {
    const row = element('tr');
    values.forEach((value) => row.append(element('td', value ?? '—')));
    body.append(row);
  });
  result.append(head, body);
  wrap.append(result);
  return wrap;
}

async function checkHealth() {
  const health = byId('health');
  try {
    const data = await request('/api/health');
    if (data.status !== 'ok') throw new Error('API unavailable');
    health.textContent = 'API Online';
    health.className = 'connection online';
  } catch {
    health.textContent = 'API Offline';
    health.className = 'connection offline';
  }
}

let selectedFile;
function selectFile(files) {
  if (files.length !== 1 || !/\.(csv|xlsx)$/i.test(files[0].name)) {
    selectedFile = undefined;
    byId('file').value = '';
    byId('file-name').textContent = 'No file selected';
    feedback('import-status', 'Choose one .csv or .xlsx file.', 'error');
    return;
  }
  selectedFile = files[0];
  byId('file-name').textContent = selectedFile.name;
  feedback('import-status', '');
}
byId('file').addEventListener('change', (event) => selectFile(event.target.files));
const dropZone = byId('drop-zone');
dropZone.addEventListener('dragover', (event) => { event.preventDefault(); dropZone.classList.add('dragging'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
dropZone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropZone.classList.remove('dragging');
  byId('file').value = '';
  selectFile(event.dataTransfer.files);
});
byId('import-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (!selectedFile) return feedback('import-status', 'Choose a .csv or .xlsx file first.', 'error');
  const data = new FormData();
  data.append('file', selectedFile);
  void withLoading(byId('import-form').querySelector('button'), 'import-status', async () => {
    await request('/api/imports', { method: 'POST', body: data });
    feedback('import-status', 'Import accepted and processing has started. Completion is reported in the server logs.', 'success');
  });
});

let searchName = '';
let searchPage = 1;
let totalPages = 0;
let searching = false;
function updatePagination() {
  byId('previous').disabled = searching || searchPage <= 1;
  byId('next').disabled = searching || searchPage >= totalPages;
  byId('pagination').hidden = totalPages <= 1;
  byId('page-label').textContent = `Page ${searchPage} of ${totalPages}`;
}
async function search(page) {
  if (searching) return;
  searching = true;
  updatePagination();
  byId('search-results').replaceChildren();
  byId('pagination').hidden = true;
  await withLoading(byId('search-form').querySelector('button'), 'search-status', async () => {
    const data = await request(`/api/policies/search?${new URLSearchParams({ name: searchName, page, limit: 20 })}`);
    searchPage = page;
    totalPages = data.pagination.totalPages;
    feedback('search-status', data.count ? `Showing ${data.count} policies · ${data.pagination.total} total` : 'No policies found for this user.');
    if (data.count) byId('search-results').append(table(
      ['Policy Number', 'User', 'Category', 'Carrier', 'Start Date', 'End Date'],
      data.policies.map((policy) => [policy.policyNumber, policy.user?.firstName, policy.category?.name,
        policy.carrier?.name, date(policy.startDate), date(policy.endDate)]), 'Policy search results'
    ));
  });
  searching = false;
  updatePagination();
}
byId('search-form').addEventListener('submit', (event) => {
  event.preventDefault();
  if (searching) return;
  searchName = byId('name').value.trim();
  if (!searchName) return feedback('search-status', 'Enter a user name.', 'error');
  totalPages = 0;
  void search(1);
});
byId('previous').addEventListener('click', () => { void search(searchPage - 1); });
byId('next').addEventListener('click', () => { void search(searchPage + 1); });

byId('load-summary').addEventListener('click', (event) => {
  byId('summary-results').replaceChildren();
  void withLoading(event.currentTarget, 'summary-status', async () => {
    const data = await request('/api/policies/aggregate');
    feedback('summary-status', data.count ? `${data.count} users with policies` : 'No policy summaries available.');
    data.users.forEach((group) => {
      const details = element('details');
      const summary = element('summary');
      summary.append(element('strong', group.user.firstName));
      if (group.user.email) summary.append(element('span', group.user.email, 'user-email'));
      summary.append(element('span', `${group.totalPolicies} policies`, 'policy-count'));
      details.append(summary, table(['Policy Number', 'Category', 'Carrier', 'Start Date', 'End Date'],
        group.policies.map((policy) => [policy.policyNumber, policy.category, policy.carrier,
          date(policy.startDate), date(policy.endDate)]), `Policies for ${group.user.firstName}`));
      byId('summary-results').append(details);
    });
  });
});

byId('schedule-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const result = byId('schedule-result');
  result.hidden = true;
  const message = byId('message').value.trim();
  if (!message) return feedback('schedule-status', 'Enter a message.', 'error');
  const body = { message, day: byId('day').value, time: byId('time').value };
  void withLoading(byId('schedule-form').querySelector('button'), 'schedule-status', async () => {
    const data = await request('/api/messages/schedule', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    feedback('schedule-status', data.message, 'success');
    result.replaceChildren();
    for (const [label, value] of [['Message', data.schedule.message], ['Scheduled time (UTC)', data.schedule.scheduledFor], ['Status', data.schedule.status]]) {
      result.append(element('dt', label), element('dd', value));
    }
    result.hidden = false;
  });
});

byId('refresh-messages').addEventListener('click', (event) => {
  byId('messages-results').replaceChildren();
  void withLoading(event.currentTarget, 'messages-status', async () => {
    const data = await request('/api/messages');
    feedback('messages-status', data.count ? `${data.count} delivered messages` : 'No delivered messages yet.');
    if (data.count) byId('messages-results').append(table(['Message', 'Scheduled For', 'Delivered At'],
      data.messages.map((message) => [message.message, date(message.scheduledFor, true), date(message.deliveredAt, true)]), 'Delivered messages'));
  });
});

void checkHealth();
window.addEventListener('online', checkHealth);

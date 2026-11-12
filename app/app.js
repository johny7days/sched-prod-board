import { fetchIncidents, ack } from './api.js';
import { formatLocal } from './time.js';

const REFRESH_MS = 2000; // R4

const list = document.querySelector('[data-testid="incident-list"]');
const loader = document.querySelector('[data-testid="loader"]');
const empty = document.querySelector('[data-testid="empty"]');
const errorBox = document.querySelector('.error');

/** Every incident seen tonight, by id. A refresh adds new ones and updates known ones; it never drops a row. */
const known = new Map();
/** Ids acked from this board: their rows keep the acked mark across refreshes. */
const acked = new Set();

function el(tag, attrs = {}, text) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function buildRow(i) {
  const row = el('li', { 'data-testid': 'incident-row', 'data-id': i.id, class: `row ${i.severity}` });
  row.append(
    el('span', { class: 'id' }, i.id),
    el('span', { class: 'sev' }, i.severity),
    el('span', { class: 'what' }, `${i.service} · ${i.region} · ${i.summary}`),
    el('time', { datetime: i.openedAt, title: i.openedAt }, formatLocal(i.openedAt)), // R5
    el('span', { class: 'act' }),
  );
  renderAck(row, i.id);
  return row;
}

function renderAck(row, id) {
  const slot = row.querySelector('.act');
  if (acked.has(id)) {
    if (!slot.querySelector('[data-testid="acked"]')) slot.replaceChildren(el('span', { 'data-testid': 'acked', class: 'acked' }, '✓ acked'));
    row.classList.add('is-acked');
    return;
  }
  if (slot.querySelector('[data-testid="ack"]')) return;
  const button = el('button', { type: 'button', 'data-testid': 'ack', class: 'ack' }, 'Ack');
  button.addEventListener('click', () => askConfirm(row, id, button)); // R2: Ack asks to confirm first
  slot.replaceChildren(button);
}

// R2 (product, after step 1): the confirm names the incident id, so a row that slid under the pointer is
// caught before anything is sent. The panel is fixed on screen, so it never moves with the list.
const confirmBox = document.querySelector('[data-testid="confirm"]');
const confirmText = confirmBox.querySelector('.confirm-text');
let pending = null;

function askConfirm(row, id, button) {
  const i = known.get(id);
  pending = { row, id, button };
  confirmText.textContent = `Ack ${id}? ${i ? `${i.severity} · ${i.service} · ${i.summary}` : ''}`;
  confirmBox.hidden = false;
  confirmBox.querySelector('[data-testid="confirm-ack"]').focus();
}

function closeConfirm() {
  pending = null;
  confirmBox.hidden = true;
}

confirmBox.querySelector('[data-testid="confirm-ack"]').addEventListener('click', () => {
  if (!pending) return;
  const { row, id, button } = pending;
  closeConfirm();
  onAck(row, id, button);
});
confirmBox.querySelector('[data-testid="confirm-cancel"]').addEventListener('click', closeConfirm);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pending) closeConfirm(); });

async function onAck(row, id, button) {
  button.disabled = true;
  button.textContent = 'Acking…';
  try {
    await ack(id);
    acked.add(id);
    renderAck(row, id);
    showError('');
  } catch (err) {
    button.disabled = false;
    button.textContent = 'Ack';
    showError(`Ack failed for ${id}: ${err.message}`);
  }
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

/** R1: newest first. Rows already on the page are kept as nodes, so a refresh never swaps a button out mid-click. */
function render() {
  const incidents = [...known.values()].sort((a, b) => Date.parse(b.openedAt) - Date.parse(a.openedAt));
  let before = list.firstElementChild;
  for (const i of incidents) {
    let row = list.querySelector(`[data-testid="incident-row"][data-id="${CSS.escape(i.id)}"]`);
    if (!row) row = buildRow(i);
    if (row !== before) list.insertBefore(row, before);
    else before = before.nextElementSibling;
  }
  empty.hidden = incidents.length > 0;
}

async function refresh() {
  try {
    const page = await fetchIncidents();
    for (const i of page.incidents) known.set(i.id, { ...known.get(i.id), ...i });
    render();
    loader.remove(); // R3: gone once incidents load
    if (!errorBox.textContent.startsWith('Ack failed')) showError('');
  } catch (err) {
    showError(`Could not load incidents: ${err.message}`);
  } finally {
    setTimeout(refresh, REFRESH_MS); // R4: every 2 s while open, never two requests at once
  }
}

refresh();

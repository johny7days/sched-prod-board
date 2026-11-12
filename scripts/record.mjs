// Records the board in use (open-board, watch-board, ack-incident) as a .webm with a visible recording clock.
// node scripts/record.mjs <board url> <out.webm> <events.json>
// The events file holds every ack (intended row, acked id, receipt) with its mm:ss in the video. Keep it out of git.
import { chromium } from 'playwright';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const [url, outVideo, outEvents] = process.argv.slice(2);
if (!url || !outVideo || !outEvents) throw new Error('usage: record.mjs <url> <out.webm> <events.json>');

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 1280, height: 720 },
  locale: 'pl-PL',
  timezoneId: 'Europe/Warsaw',
  recordVideo: { dir: dirname(outVideo), size: { width: 1280, height: 720 } },
});
// A clock in the corner, so every moment in the report can be found by eye.
const t0 = Date.now(); // video time 00:00 ≈ page creation, right after this
await context.addInitScript((start) => {
  addEventListener('DOMContentLoaded', () => {
    const clock = document.createElement('div');
    clock.id = 'rec-clock';
    clock.style.cssText = 'position:fixed;right:12px;bottom:12px;padding:4px 8px;background:#1d1d1f;color:#fff;font:600 14px ui-monospace,monospace;border-radius:4px;z-index:9;pointer-events:none';
    const caption = document.createElement('div');
    caption.id = 'rec-caption';
    caption.style.cssText = 'position:fixed;left:12px;bottom:12px;padding:4px 8px;background:#fff3c4;color:#1d1d1f;font:14px system-ui;border-radius:4px;z-index:9;pointer-events:none';
    document.body.append(clock, caption);
    const tick = () => {
      const s = Math.max(0, Math.floor((Date.now() - start) / 1000));
      clock.textContent = `rec ${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
      requestAnimationFrame(tick);
    };
    tick();
  });
}, t0);

const mmss = () => {
  const s = Math.floor((Date.now() - t0) / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};
const events = [];
const note = (e) => { const ev = { at: mmss(), utc: new Date().toISOString(), ...e }; events.push(ev); console.log(JSON.stringify({ ...ev, receipt: ev.receipt ? '…' : undefined })); };

const page = await context.newPage();
page.on('response', async (res) => {
  if (!res.url().includes('/ack?')) return;
  try { const body = await res.json(); note({ kind: 'ack-response', id: body.id, ackedAt: body.ackedAt, receipt: body.receipt }); } catch {}
});
const caption = (text) => page.evaluate((t) => { const c = document.getElementById('rec-caption'); if (c) c.textContent = t; }, text);
const rowIds = () => page.$$eval('[data-testid="incident-row"]', (rows) => rows.map((r) => r.dataset.id));

// open-board: loader, then tonight's incidents.
note({ kind: 'open-board', url });
await page.goto(url);
await page.getByTestId('incident-row').first().waitFor();
const sha = await page.getAttribute('meta[name="build"]', 'content');
note({ kind: 'list-loaded', rows: (await rowIds()).length, sha });
await caption('open-board: incidents loaded, newest first');
await page.waitForTimeout(3000);

// watch-board: no reload; new incidents arrive at the top.
await caption('watch-board: board stays open, no reload');
const before = await rowIds();
await page.waitForFunction((top) => document.querySelector('[data-testid="incident-row"]')?.dataset.id !== top, before[0], { timeout: 60000 });
note({ kind: 'new-incident-on-top', top: (await rowIds())[0] });
await page.waitForTimeout(2000);

// ack-incident: aim at a row's Ack button, then click where it was when a new incident lands on top.
const target = (await rowIds())[2];
const box = await page.locator(`[data-testid="incident-row"][data-id="${target}"] [data-testid="ack"]`).boundingBox();
const x = box.x + box.width / 2;
const y = box.y + box.height / 2;
await page.mouse.move(x, y);
await caption(`ack-incident: pointer on Ack of ${target}`);
note({ kind: 'aim', target });
const top = (await rowIds())[0];
await page.waitForFunction((t) => document.querySelector('[data-testid="incident-row"]')?.dataset.id !== t, top, { timeout: 60000 });
await page.mouse.click(x, y);
note({ kind: 'click', target, at_point: [Math.round(x), Math.round(y)] });
await page.waitForTimeout(1200);
// Build with the Ack confirm (product's decision): read the id it names; wrong one -> Cancel, Ack the intended row, confirm.
if (await page.locator('[data-testid="confirm"]:visible').count()) {
  let named = await page.getByTestId('confirm').innerText();
  note({ kind: 'confirm-shown', text: named });
  if (!named.includes(target)) {
    await caption(`confirm names another incident, not ${target} -> Cancel`);
    await page.waitForTimeout(2500);
    await page.getByTestId('confirm-cancel').click();
    note({ kind: 'confirm-cancel' });
    await page.waitForTimeout(800);
    await caption(`Ack on ${target} again`);
    await page.locator(`[data-testid="incident-row"][data-id="${target}"] [data-testid="ack"]`).click();
    await page.waitForTimeout(1200);
    named = await page.getByTestId('confirm').innerText();
    note({ kind: 'confirm-shown', text: named });
  }
  await caption(`confirm names ${target} -> Ack`);
  await page.waitForTimeout(2000);
  await page.getByTestId('confirm-ack').click();
  note({ kind: 'confirm-ack', target });
}
await page.waitForTimeout(2500);
const ackedRows = await page.$$eval('[data-testid="incident-row"]:has([data-testid="acked"])', (rows) => rows.map((r) => r.dataset.id));
note({ kind: 'acked-rows', ackedRows, intended: target });
await caption(`aimed at ${target} · acked: ${ackedRows.join(', ')}`);
await page.waitForTimeout(4000);

const video = page.video();
await context.close();
await browser.close();
mkdirSync(dirname(outVideo), { recursive: true });
renameSync(await video.path(), outVideo);
writeFileSync(outEvents, JSON.stringify({ url, sha, events }, null, 2));
console.log(`video ${outVideo} · events ${outEvents}`);

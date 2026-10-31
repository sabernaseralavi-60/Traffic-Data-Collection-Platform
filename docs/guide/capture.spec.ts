import fs from 'node:fs';
import path from 'node:path';
import { devices, expect, test, type BrowserContext, type Page } from '@playwright/test';

// Screenshots for the user guide (Persian UI). Not part of the test suite: see playwright.guide.config.ts.
const OUT = 'docs/guide/img';
fs.mkdirSync(OUT, { recursive: true });
const MAP1 = path.resolve('docs/guide/sample_map_1.svg');
const MAP2 = path.resolve('docs/guide/sample_map_2.svg');
const PW = 'Guide-pass-1';

const persian = (ctx: BrowserContext) => ctx.addInitScript(() => localStorage.setItem('tl_lang', 'fa'));
async function login(page: Page, u: string, p: string) {
  await page.goto('/');
  await page.getByTestId('login-username').fill(u);
  await page.getByTestId('login-password').fill(p);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('logout')).toBeVisible({ timeout: 15_000 });
}
const mark = async (page: Page, ...ids: string[]) => { for (const id of ids) await page.locator(`[data-testid="${id}"]`).first().evaluate((el) => { (el as HTMLElement).style.outline = '3px solid #f43f5e'; (el as HTMLElement).style.outlineOffset = '3px'; }); };
const shot = (page: Page, name: string, full = false) => page.screenshot({ path: `${OUT}/${name}.png`, fullPage: full });
const elShot = (page: Page, testid: string, name: string) => page.getByTestId(testid).screenshot({ path: `${OUT}/${name}.png` });
async function useDemo(page: Page) {
  const sel = page.getByLabel('Active study').or(page.getByLabel('طرح فعال'));
  await sel.waitFor({ state: 'visible', timeout: 15_000 });
  const v = await sel.locator('option', { hasText: 'DEMO' }).first().getAttribute('value');
  await sel.selectOption(v!);
  await expect(page.getByTestId('demo-banner')).toBeVisible();
}
async function drag(page: Page, code: string, xPct: number, yPct: number) {
  const canvas = (await page.getByTestId('map-canvas').boundingBox())!;
  const m = (await page.getByTestId(`marker-${code}`).locator('span').first().boundingBox())!;
  await page.mouse.move(m.x + m.width / 2, m.y + m.height / 2);
  await page.mouse.down();
  await page.mouse.move(canvas.x + (canvas.width * xPct) / 100, canvas.y + (canvas.height * yPct) / 100, { steps: 8 });
  await page.mouse.up();
}

test('capture guide screenshots', async ({ browser }) => {
  const desk = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['microphone'] });
  const mob = await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone'] });
  await persian(desk); await persian(mob);
  const admin = await desk.newPage();
  const phone = await mob.newPage();

  // ---- login (phone) and the administrator's first look
  await phone.goto('/');
  await mark(phone, 'login-username', 'login-password', 'login-submit');
  await shot(phone, '01-login');
  await login(admin, 'admin', 'Admin-pass-1');
  await expect(admin.getByTestId('study-title')).toBeVisible({ timeout: 20_000 });
  await expect(admin.getByTestId('kpi-matched')).toContainText(/\d/);
  await shot(admin, '02-dashboard-admin');

  // ---- accounts and categories
  await admin.getByTestId('tab-accounts').click();
  await expect(admin.getByTestId('users-table')).toBeVisible();
  await shot(admin, '03-accounts', true);

  // ---- new study
  await admin.getByTestId('tab-studies').click();
  await admin.getByTestId('new-study-name').fill('نمونه: برداشت تقاطع و میدان دانشگاه');
  await admin.getByLabel(/Supervisor|سرپرست/).first().fill('مهندس نمونه');
  await mark(admin, 'new-study-name', 'create-study');
  await admin.screenshot({ path: `${OUT}/04-new-study.png`, clip: { x: 0, y: 60, width: 1280, height: 330 } });
  await admin.getByTestId('create-study').click();
  await expect(admin.getByTestId('setup-msg')).toBeVisible();

  // ---- map sections: image for section 1, a second section with its own image
  await admin.getByTestId('map-upload').setInputFiles(MAP1);
  await expect(admin.getByTestId('setup-msg')).toContainText(/بارگذاری|uploaded/);
  await admin.getByLabel(/Section name|نام بخش/).last().fill('بخش ۱ - چهارراه');
  await admin.getByLabel(/Section name|نام بخش/).last().blur();
  await admin.getByTestId('new-map-name').fill('بخش ۲ - میدان');
  await admin.getByTestId('map-add-upload').setInputFiles(MAP2);
  await expect(admin.getByTestId('map-tab-بخش ۲ - میدان')).toBeVisible();
  await admin.getByTestId('map-tab-بخش ۱ - چهارراه').click();
  await admin.addStyleTag({ content: '.sticky{position:static !important}' }); // the floating save bar would cover element screenshots

  // ---- entries and exits on section 1, dragged to the arms of the junction
  for (const t of ['add-entry', 'add-entry', 'add-exit', 'add-exit']) await admin.getByTestId(t).click();
  await drag(admin, 'E01', 7, 50); await drag(admin, 'E02', 50, 7); await drag(admin, 'X01', 93, 50); await drag(admin, 'X02', 50, 93);
  const desc: Record<string, string> = { E01: 'ورودی غربی', E02: 'ورودی شمالی', X01: 'خروجی شرقی', X02: 'خروجی جنوبی' };
  for (const [c, d] of Object.entries(desc)) await admin.getByTestId(`point-card-${c}`).getByLabel('Description').fill(d);
  await admin.getByTestId('map-tab-بخش ۲ - میدان').click();
  await admin.getByTestId('add-entry').click();   // E03 on the roundabout section
  await admin.getByTestId('add-exit').click();    // X03
  await drag(admin, 'E03', 7, 52); await drag(admin, 'X03', 93, 52);
  await admin.getByTestId('point-card-E03').getByLabel('Description').fill('ورودی میدان از غرب');
  await admin.getByTestId('point-card-X03').getByLabel('Description').fill('خروجی میدان به شرق');
  await admin.getByTestId('map-tab-بخش ۱ - چهارراه').click();

  // ---- people at the points (accounts created on the spot)
  const people: [string, string, string][] = [['علی احمدی', 'ali.ahmadi', 'E01'], ['حسین رضایی', 'hossein.rezaei', 'E02'], ['مریم کریمی', 'maryam.karimi', 'X01'], ['زهرا نوری', 'zahra.nouri', 'X02'], ['رضا محمدی', 'reza.mohammadi', 'E03'], ['سارا حسینی', 'sara.hosseini', 'X03']];
  for (const [name, user, point] of people) {
    await admin.getByTestId('qp-name').fill(name);
    await admin.getByTestId('qp-username').fill(user);
    await admin.getByTestId('qp-password').fill(PW);
    await admin.getByTestId('qp-point').selectOption(point);
    await admin.getByTestId('qp-create').click();
    await expect(admin.getByTestId(`person-${point}`)).toContainText(name);
  }
  for (const [o, d, m] of [['E01', 'X01', '1200'], ['E01', 'X02', '1500'], ['E02', 'X01', '1500'], ['E02', 'X02', '1200']]) await admin.getByTestId(`dist-${o}-${d}`).fill(m);
  await admin.getByTestId('save-all').click();
  await expect(admin.getByTestId('setup-msg')).toContainText(/ذخیره شد|Saved/);
  await admin.getByTestId('study-status').selectOption('ACTIVE');
  await expect(admin.getByTestId('study-status')).toHaveValue('ACTIVE');

  await mark(admin, 'map-upload', 'add-map', 'new-map-name');
  await elShot(admin, 'maps-panel', '05-maps');
  await admin.evaluate(() => document.querySelectorAll<HTMLElement>('[data-testid]').forEach((e) => { e.style.outline = ''; }));
  await mark(admin, 'add-entry', 'add-exit', 'point-card-E01', 'add-person-E01');
  await elShot(admin, 'points-panel', '06-points');
  await admin.evaluate(() => document.querySelectorAll<HTMLElement>('[data-testid]').forEach((e) => { e.style.outline = ''; }));
  await mark(admin, 'quick-person', 'qp-create');
  await elShot(admin, 'quick-person', '07-quick-person');
  await admin.evaluate(() => document.querySelectorAll<HTMLElement>('[data-testid]').forEach((e) => { e.style.outline = ''; }));
  await mark(admin, 'save-all', 'print-sheet', 'study-status', 'audio-toggle');
  await admin.screenshot({ path: `${OUT}/08-save-bar.png`, clip: { x: 0, y: 60, width: 1280, height: 330 } });
  await admin.evaluate(() => document.querySelectorAll<HTMLElement>('[data-testid]').forEach((e) => { e.style.outline = ''; }));
  await admin.getByTestId('map-tab-بخش ۱ - چهارراه').click();
  await elShot(admin, 'maps-panel', '09-map-with-points');
  await admin.emulateMedia({ media: 'print' });
  await elShot(admin, 'team-sheet', '10-team-sheet');
  await admin.emulateMedia({ media: 'screen' });

  // ---- the observer on the phone
  await phone.reload();
  await login(phone, 'ali.ahmadi', PW);
  await expect(phone.getByTestId('station-code')).toHaveText('E01');
  await mark(phone, 'station-banner');
  await shot(phone, '11-collector-top');
  await phone.evaluate(() => document.querySelectorAll<HTMLElement>('[data-testid]').forEach((e) => { e.style.outline = ''; }));
  await mark(phone, 'plate-input', 'voice-button', 'record-button');
  await phone.getByTestId('key-3').click(); await phone.getByTestId('key-8').click(); await phone.getByTestId('key-7').click();
  await shot(phone, '12-collector-keypad', true);
  await phone.getByTestId('record-button').click();
  await expect(phone.getByTestId('notice')).toContainText('387');
  await phone.evaluate(() => document.querySelectorAll<HTMLElement>('[data-testid]').forEach((e) => { e.style.outline = ''; }));
  await phone.getByTestId('voice-button').click();
  await phone.waitForTimeout(1800);
  await phone.screenshot({ path: `${OUT}/13-recording.png` });
  await phone.getByTestId('voice-button').click();
  await expect(phone.getByTestId('clip-row')).toBeVisible({ timeout: 10_000 });
  await phone.getByTestId('plate-input').fill('042');
  await mark(phone, 'clip-row', 'record-button');
  await shot(phone, '14-clip-ready');
  await phone.evaluate(() => document.querySelectorAll<HTMLElement>('[data-testid]').forEach((e) => { e.style.outline = ''; }));
  await phone.getByTestId('record-button').click();
  await expect(phone.getByTestId('notice')).toContainText('042');
  await expect(phone.getByTestId('clip-row')).toHaveCount(0);
  await mob.setOffline(true);
  await phone.getByTestId('plate-input').fill('615');
  await phone.getByTestId('record-button').click();
  await expect(phone.getByTestId('pending-sync')).toBeVisible();
  await mark(phone, 'pending-sync');
  await shot(phone, '15-offline');
  await mob.setOffline(false);
  await expect(phone.getByTestId('pending-sync')).toHaveCount(0, { timeout: 20_000 });

  // ---- the supervisor on the demonstration study
  const supCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await persian(supCtx);
  const sup = await supCtx.newPage();
  await login(sup, 'supervisor', 'Demo-pass-1');
  await useDemo(sup);
  await expect(sup.getByTestId('kpi-matched')).toContainText(/\d/, { timeout: 20_000 });
  await shot(sup, '16-dashboard', true);
  await sup.getByTestId('tab-matching').click();
  await sup.getByTestId('run-matching').click();
  await expect(sup.getByTestId('ambiguous-box')).toBeVisible();
  await mark(sup, 'run-matching', 'ambiguous-box');
  await shot(sup, '17-matching', true);
  await sup.getByTestId('tab-od_matrix').click();
  await expect(sup.getByTestId('od-table')).toBeVisible();
  await shot(sup, '18-od', true);
  await sup.getByTestId('tab-reports').click();
  await expect(sup.getByTestId('report-article')).toBeVisible();
  await mark(sup, 'export-xlsx', 'export-csv');
  await shot(sup, '19-reports');

  // ---- a clip recorded at the demo exit, then listened to and corrected
  const o2Ctx = await browser.newContext({ ...devices['Pixel 7'], permissions: ['microphone'] });
  await persian(o2Ctx);
  const o2 = await o2Ctx.newPage();
  await login(o2, 'observer02', 'Demo-pass-1');
  await o2.getByTestId('voice-button').click(); await o2.waitForTimeout(1800); await o2.getByTestId('voice-button').click();
  await expect(o2.getByTestId('clip-row')).toBeVisible({ timeout: 10_000 });
  await o2.getByTestId('plate-input').fill('888');
  await o2.getByTestId('record-button').click();
  await expect(o2.getByTestId('notice')).toContainText('888');
  await sup.getByTestId('tab-observations').click();
  await sup.getByTestId('play-888').click();
  await mark(sup, 'audio-player');
  await shot(sup, '20-passages');
  await sup.evaluate(() => document.querySelectorAll<HTMLElement>('[data-testid]').forEach((e) => { e.style.outline = ''; }));
  await sup.getByTestId('obs-row-888').getByTestId('correct-open').click();
  await sup.getByTestId('correct-input').fill('886');
  await mark(sup, 'correct-input', 'correct-save');
  await shot(sup, '21-correct');
  await sup.getByTestId('correct-save').click();
  await expect(sup.getByTestId('obs-row-886')).toBeVisible();
  sup.once('dialog', (d) => d.accept());
  await sup.getByTestId('obs-row-886').getByLabel(/لغو ثبت|Undo entry/).click();
  await expect(sup.getByTestId('obs-row-886')).toHaveCount(0);
});

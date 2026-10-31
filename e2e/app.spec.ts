import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const DEMO_PW = process.env.E2E_DEMO_PASSWORD ?? 'Demo-pass-1';
const CREDS: Record<string, string> = JSON.parse(process.env.E2E_CREDS ?? '{}'); // per-account passwords when running against a deployed instance
const ADMIN_PW = process.env.E2E_ADMIN_PASSWORD ?? 'Admin-pass-1';
const pw = (u: string) => CREDS[u] ?? (u === 'ad' ? ADMIN_PW : DEMO_PW);
const SHOTS = 'e2e/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });

async function login(page: Page, username: string, password: string) {
  await page.goto('/');
  await page.getByTestId('login-username').fill(username);
  await page.getByTestId('login-password').fill(password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('logout')).toBeVisible({ timeout: 15_000 });
}
/** The shared server may hold studies created by other tests: always work on the DEMO study explicitly. */
async function useDemoStudy(page: Page) {
  const sel = page.getByLabel('Active study');
  await sel.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}); // the list loads after login; absent when only one study exists
  if (await sel.count()) {
    const v = await sel.locator('option', { hasText: 'DEMO' }).first().getAttribute('value');
    await sel.selectOption(v!);
  }
  await expect(page.getByTestId('demo-banner')).toBeVisible();
}
const shot = (page: Page, name: string, project: string) => page.screenshot({ path: `${SHOTS}/${project}-${name}.png`, fullPage: true });

test.describe('login and roles', () => {
  test('wrong password is refused with a clear message; there is no user switcher', async ({ page }) => {
    await page.goto('/');
    await shot(page, 'login', test.info().project.name);
    await page.getByTestId('login-username').fill('e1');
    await page.getByTestId('login-password').fill('wrong-password');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText(/wrong username or password/i);
    await expect(page.getByText(/switch (role|to this account)/i)).toHaveCount(0);
  });

  test('observer sees only the collector and cannot call admin APIs', async ({ page }) => {
    await login(page, 'e1', pw('e1'));
    await expect(page.getByTestId('tab-collector')).toBeVisible();
    for (const tab of ['accounts', 'studies', 'matching', 'reports']) await expect(page.getByTestId(`tab-${tab}`)).toHaveCount(0);
    const codes = await page.evaluate(async () => {
      const get = async (p: string) => (await fetch(`/api/v1${p}`)).status;
      return { users: await get('/users'), audit: await get('/audit') };
    });
    expect(codes).toEqual({ users: 403, audit: 403 });
  });
});

test.describe('field collection', () => {
  test('assigned station is pinned; 3 digits are required; record via keypad; leading zero kept', async ({ page }) => {
    const project = test.info().project.name;
    await login(page, 'e1', pw('e1'));
    await expect(page.getByTestId('station-code')).toHaveText('E01');
    await expect(page.getByTestId('station-banner')).toContainText('ENTRY');
    await page.getByTestId('key-7').click();
    await page.getByTestId('key-7').click();
    await expect(page.getByTestId('record-button')).toBeDisabled(); // 2 digits are not enough, never padded
    await page.getByTestId('key-0').click();
    await expect(page.getByTestId('plate-input')).toHaveValue('770');
    await page.getByTestId('plate-input').fill('042');
    await page.getByTestId('record-button').click();
    await expect(page.getByTestId('notice')).toContainText('042');
    await expect(page.getByTestId('recent-list')).toContainText('042');
    await expect(page.getByTestId('plate-input')).toHaveValue('');
    await shot(page, 'collector', project);
  });

  test('offline: the sighting is kept on the device with its original time, then synced when the connection returns', async ({ page, context }) => {
    const project = test.info().project.name;
    await login(page, 'e2', pw('e2'));
    await expect(page.getByTestId('station-code')).toHaveText('E02');
    await context.setOffline(true);
    await expect(page.getByText(/offline/i).first()).toBeVisible();
    await page.getByTestId('plate-input').fill('613');
    await page.getByTestId('record-button').click();
    await expect(page.getByTestId('notice')).toContainText(/saved on this device/i);
    await expect(page.getByTestId('pending-sync')).toContainText('1');
    await shot(page, 'offline', project);
    await context.setOffline(false);
    await expect(page.getByTestId('pending-sync')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.getByTestId('recent-list')).toContainText('613');
    await expect(page.getByTestId('recent-list')).not.toContainText(/pending upload/i);
  });

  test('a fresh page load while offline still opens the app shell (service worker)', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'chromium only');
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByTestId('login-form')).toBeVisible();
    await context.setOffline(false);
  });
});

test.describe('supervisor and administrator', () => {
  test('dashboard shows computed KPIs; ambiguous case is reviewed and stays resolved', async ({ page }) => {
    const project = test.info().project.name;
    await login(page, 'ad', pw('ad'));
    await useDemoStudy(page);
    await expect(page.getByTestId('kpi-matched')).toContainText(/Matched Journeys\s*[1-9]/);
    await shot(page, 'dashboard', project);

    await page.getByTestId('tab-matching').click();
    await page.getByTestId('run-matching').click();
    const box = page.getByTestId('ambiguous-box');
    await expect(box).toBeVisible();
    await shot(page, 'matching', project);
    await box.getByTestId('confirm-pair').first().click();
    await expect(page.getByTestId('matches-table')).toContainText('REVIEWED');
    await page.getByTestId('run-matching').click();
    await expect(page.getByTestId('matches-table')).toContainText('REVIEWED'); // persisted, not just React state

    await page.getByTestId('tab-od_matrix').click();
    await expect(page.getByTestId('od-total')).toContainText(/\d+/);
    await expect(page.getByTestId('speed-table')).toContainText('km/h');
    await shot(page, 'od', project);

    // leave the shared demo study as we found it, so the test can run again (mobile then desktop use one server)
    await page.getByTestId('tab-matching').click();
    await page.getByRole('button', { name: 'undo' }).first().click();
    await expect(page.getByTestId('ambiguous-box')).toBeVisible();
  });

  test('exports download as real files', async ({ page }) => {
    await login(page, 'sv', pw('sv'));
    await useDemoStudy(page);
    await page.getByTestId('tab-reports').click();
    await expect(page.getByTestId('report-article')).toContainText(/Origin/i);
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('admin sets up a study: two map sections, entries/exits, a person at each, team sheet, activate', async ({ page }) => {
    const project = test.info().project.name;
    const tag = `${project}${Date.now().toString(36)}`;
    await login(page, 'ad', pw('ad'));
    await page.getByTestId('tab-studies').click();
    await page.getByTestId('new-study-name').fill(`E2E study ${project}`);
    await page.getByTestId('create-study').click();
    await expect(page.getByTestId('setup-msg')).toContainText(/study created/i);

    // road-map sections: the study starts with "Map 1"; add a second one and put the exit on it
    await page.getByTestId('new-map-name').fill('North junction');
    await page.getByTestId('add-map').click();
    await expect(page.getByTestId('setup-msg')).toContainText(/section added/i);
    await page.getByTestId('add-entry').click();                       // E01 lands on the active section (Map 1)
    await page.getByTestId('map-tab-North junction').click();
    await page.getByTestId('add-exit').click();                        // X01 lands on North junction
    await expect(page.getByTestId('marker-X01')).toBeVisible();
    await expect(page.getByTestId('marker-E01')).toHaveCount(0);       // E01 is drawn on the other section
    await page.getByTestId('map-tab-Map 1').click();
    await expect(page.getByTestId('marker-E01')).toBeVisible();
    await page.getByTestId('dist-E01-X01').fill('1800');

    // one person per point, created on the spot
    for (const [point, name] of [['E01', 'Counter Entry'], ['X01', 'Counter Exit']] as const) {
      await page.getByTestId('qp-name').fill(`${name} ${tag}`);
      await page.getByTestId('qp-username').fill(`${name.split(' ')[1].toLowerCase()}.${tag}`.slice(0, 32));
      await page.getByTestId('qp-password').fill('Observer-pass-1');
      await page.getByTestId('qp-point').selectOption(point);
      await page.getByTestId('qp-create').click();
      await expect(page.getByTestId('setup-msg')).toContainText(/account created/i);
    }
    await expect(page.getByTestId('person-E01')).toContainText('Counter Entry');
    await expect(page.getByTestId('person-X01')).toContainText('Counter Exit');
    await page.getByTestId('save-all').click();
    await expect(page.getByTestId('setup-msg')).toContainText(/saved/i);
    await expect(page.getByTestId('person-X01')).toContainText('Counter Exit'); // still there after the reload from the server
    await page.getByTestId('study-status').selectOption('ACTIVE');
    await expect(page.getByTestId('study-status')).toHaveValue('ACTIVE');
    await shot(page, 'setup', project);

    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('team-sheet')).toBeVisible();
    await expect(page.getByTestId('team-sheet')).toContainText(`Counter Exit ${tag}`);
    await expect(page.getByTestId('team-sheet')).toContainText('North junction');
    await page.emulateMedia({ media: 'screen' });

    // the new person can sign in and sees exactly their own point
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('login-form')).toBeVisible(); // wait until the sign-out request has finished before navigating
    await login(page, `exit.${tag}`.slice(0, 32), 'Observer-pass-1');
    await expect(page.getByTestId('station-code')).toHaveText('X01');
  });

  test('voice clip per passage: observer records, supervisor listens and corrects', async ({ page }) => {
    test.skip(!!process.env.E2E_BASE_URL && false, 'runs live too');
    const project = test.info().project.name;
    await login(page, 'x1', pw('x1'));
    await expect(page.getByTestId('station-code')).toHaveText('X01');
    await page.getByTestId('voice-button').click();
    await page.waitForTimeout(1800);                          // the fake microphone produces a tone
    await page.getByTestId('voice-button').click();           // stop
    await expect(page.getByTestId('clip-row')).toBeVisible({ timeout: 10_000 });
    await page.getByTestId('plate-input').fill('888');
    await page.getByTestId('record-button').click();
    await expect(page.getByTestId('notice')).toContainText('888');
    await expect(page.getByTestId('clip-row')).toHaveCount(0);       // the clip travelled with the passage
    await page.getByTestId('logout').click();
    await expect(page.getByTestId('login-form')).toBeVisible(); // wait until the sign-out request has finished before navigating

    await login(page, 'sv', pw('sv'));
    await useDemoStudy(page);
    await page.getByTestId('tab-observations').click();
    const row = page.getByTestId('obs-row-888');
    await expect(row).toBeVisible();
    await row.getByTestId('play-888').click();
    await expect(page.getByTestId('audio-player')).toBeVisible();
    const audio = await page.evaluate(async () => {
      const id = document.querySelector('audio')!.getAttribute('src')!;
      const r = await fetch(id);
      return { status: r.status, type: r.headers.get('content-type'), bytes: (await r.arrayBuffer()).byteLength };
    });
    expect(audio.status).toBe(200);
    expect(audio.type).toMatch(/^audio\//);
    expect(audio.bytes).toBeGreaterThan(500);
    await shot(page, 'passages', project);

    await row.getByTestId('correct-open').click();
    await page.getByTestId('correct-input').fill('886');
    await page.getByTestId('correct-save').click();
    await expect(page.getByTestId('obs-msg')).toContainText(/corrected/i);
    const fixed = page.getByTestId('obs-row-886');
    await expect(fixed).toBeVisible();
    await expect(page.getByTestId('obs-row-888')).toHaveCount(0);
    await expect(fixed.getByTestId('play-886')).toBeVisible();        // the clip stayed with the corrected entry

    page.once('dialog', (d) => d.accept());                           // leave the shared demo study as we found it
    await fixed.getByLabel(/undo entry|لغو ثبت/i).click();
    await expect(page.getByTestId('obs-row-886')).toHaveCount(0);
  });

  test('persian / RTL layout', async ({ page }) => {
    const project = test.info().project.name;
    await page.goto('/');
    await page.getByRole('button', { name: 'فارسی' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await shot(page, 'login-fa', project);
    await login(page, 'x1', pw('x1'));
    await expect(page.getByTestId('station-code')).toHaveText('X01');
    await shot(page, 'collector-fa', project);
  });
});

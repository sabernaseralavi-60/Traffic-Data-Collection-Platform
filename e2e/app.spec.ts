import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

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
    await page.getByTestId('login-username').fill('observer01');
    await page.getByTestId('login-password').fill('wrong-password');
    await page.getByTestId('login-submit').click();
    await expect(page.getByTestId('login-error')).toContainText(/wrong username or password/i);
    await expect(page.getByText(/switch (role|to this account)/i)).toHaveCount(0);
  });

  test('observer sees only the collector and cannot call admin APIs', async ({ page }) => {
    await login(page, 'observer01', 'Demo-pass-1');
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
    await login(page, 'observer01', 'Demo-pass-1');
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
    await login(page, 'observer03', 'Demo-pass-1');
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
    await login(page, 'admin', 'Admin-pass-1');
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
    await login(page, 'supervisor', 'Demo-pass-1');
    await useDemoStudy(page);
    await page.getByTestId('tab-reports').click();
    await expect(page.getByTestId('report-article')).toContainText(/Origin/i);
    const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-xlsx').click()]);
    expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/);
    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
    expect(csv.suggestedFilename()).toMatch(/\.csv$/);
  });

  test('admin sets up a study: create, points, distance, assignment, activate', async ({ page }) => {
    const project = test.info().project.name;
    await login(page, 'admin', 'Admin-pass-1');
    await page.getByTestId('tab-studies').click();
    await page.getByTestId('new-study-name').fill(`E2E study ${project}`);
    await page.getByTestId('create-study').click();
    await expect(page.getByTestId('setup-msg')).toContainText(/study created/i);
    await page.getByTestId('add-entry').click();
    await page.getByTestId('add-exit').click();
    await page.getByTestId('dist-E01-X01').fill('1800');
    await page.getByTestId('save-points').click();
    await expect(page.getByTestId('setup-msg')).toContainText(/saved/i);
    await page.getByTestId('add-assignment').click();
    await page.getByTestId('asg-user-0').selectOption({ label: 'Zahra Karimi (@observer04)' });
    await page.getByTestId('asg-point-0').selectOption('X01');
    await page.getByTestId('save-assignments').click();
    await expect(page.getByTestId('setup-msg')).toContainText(/assignments saved/i);
    await page.getByTestId('study-status').selectOption('ACTIVE');
    await expect(page.getByTestId('setup-msg')).toContainText(/saved/i);
    await shot(page, 'setup', project);
  });

  test('persian / RTL layout', async ({ page }) => {
    const project = test.info().project.name;
    await page.goto('/');
    await page.getByRole('button', { name: 'فارسی' }).click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await shot(page, 'login-fa', project);
    await login(page, 'observer02', 'Demo-pass-1');
    await expect(page.getByTestId('station-code')).toHaveText('X01');
    await shot(page, 'collector-fa', project);
  });
});

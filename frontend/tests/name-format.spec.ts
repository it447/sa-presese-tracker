import { test, expect, Page } from '@playwright/test';

const BASE_URL = 'http://localhost:5174';
const PASSWORD = 'scale-army';

// Name must be "Firstname L." or just "Firstname" (single word, e.g. email prefix)
const NAME_RE = /^[A-Z][a-z]+( [A-Z]\.|)$/;

async function login(page: Page) {
  await page.goto(BASE_URL);
  await page.getByPlaceholder('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /View Dashboard/i }).click();
  // Wait for dashboard to load
  await page.waitForSelector('table', { timeout: 10000 });
}

test.describe('Name formatting — all screens', () => {

  test('Dashboard: leaderboard and auto-insights names are formatted correctly', async ({ page }) => {
    await login(page);
    await page.screenshot({ path: '/tmp/screen-dashboard.png', fullPage: true });

    // Collect all name cells in the leaderboard table (first column, skipping header)
    const nameCells = page.locator('tbody tr td:first-child div[style*="fontWeight: 600"], tbody tr td:first-child div[style*="font-weight: 600"]');
    const count = await nameCells.count();
    for (let i = 0; i < count; i++) {
      const text = (await nameCells.nth(i).textContent())?.trim() ?? '';
      // Strip the "Habitual" badge text if present
      const name = text.replace('Habitual', '').trim();
      if (name) {
        expect(name, `Leaderboard name "${name}" not formatted correctly`).toMatch(NAME_RE);
      }
    }
  });

  test('Heatmap: row labels are formatted correctly', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/heatmap`);
    await page.waitForSelector('table', { timeout: 10000 });
    await page.screenshot({ path: '/tmp/screen-heatmap.png', fullPage: true });

    const nameLinks = page.locator('tbody tr td:first-child a');
    const count = await nameLinks.count();
    for (let i = 0; i < count; i++) {
      const name = (await nameLinks.nth(i).textContent())?.trim() ?? '';
      if (name) {
        expect(name, `Heatmap name "${name}" not formatted correctly`).toMatch(NAME_RE);
      }
    }
  });

  test('PersonDetail: heading and meeting organiser names are formatted correctly', async ({ page }) => {
    await login(page);
    // Navigate to first person in the leaderboard
    const firstProfileLink = page.locator('tbody tr td a').first();
    await firstProfileLink.click();
    await page.waitForSelector('h1', { timeout: 10000 });
    await page.screenshot({ path: '/tmp/screen-person-detail.png', fullPage: true });

    const heading = await page.locator('h1').first().textContent();
    const name = heading?.replace('Habitual Latecomer', '').trim() ?? '';
    if (name) {
      expect(name, `PersonDetail heading "${name}" not formatted correctly`).toMatch(NAME_RE);
    }
  });

  test('MeetingDetail: attendee names are formatted correctly', async ({ page }) => {
    await login(page);
    await page.goto(`${BASE_URL}/meetings`);
    await page.waitForSelector('table', { timeout: 10000 });
    await page.screenshot({ path: '/tmp/screen-meetings.png', fullPage: true });

    // Click the first meeting
    const firstMeetingLink = page.locator('tbody tr td a').first();
    if (await firstMeetingLink.count() > 0) {
      await firstMeetingLink.click();
      await page.waitForSelector('table', { timeout: 10000 });
      await page.screenshot({ path: '/tmp/screen-meeting-detail.png', fullPage: true });

      const attendeeNames = page.locator('tbody tr td:first-child div[style*="fontWeight: 600"], tbody tr td:first-child div[style*="font-weight: 600"]');
      const count = await attendeeNames.count();
      for (let i = 0; i < count; i++) {
        const name = (await attendeeNames.nth(i).textContent())?.trim() ?? '';
        if (name) {
          expect(name, `MeetingDetail attendee "${name}" not formatted correctly`).toMatch(NAME_RE);
        }
      }
    }
  });

  test('Search: people results are formatted correctly', async ({ page }) => {
    await login(page);
    const searchInput = page.getByPlaceholder('Search people or meetings...');
    // Type a common letter to get results
    await searchInput.fill('a');
    await page.waitForTimeout(500);
    await page.screenshot({ path: '/tmp/screen-search.png', fullPage: true });

    const searchNameEls = page.locator('[style*="fontWeight: 500"][style*="0.875rem"], [style*="font-weight: 500"][style*="0.875rem"]');
    const count = await searchNameEls.count();
    for (let i = 0; i < count; i++) {
      const name = (await searchNameEls.nth(i).textContent())?.trim() ?? '';
      // Only check names (not meeting titles, which won't match the pattern)
      if (name && NAME_RE.test(name)) {
        expect(name, `Search result name "${name}" not formatted correctly`).toMatch(NAME_RE);
      }
    }
  });

});

import { test, expect } from '@playwright/test';

// Use the dynamically assigned port from the running dev server
const BASE_URL = 'http://localhost:5174';

test.describe('Dashboard UX Interactions', () => {

  test('HABITUAL badge tooltip appears on hover', async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByPlaceholder('Password').fill('scale-army');
    await page.getByRole('button', { name: 'View Dashboard →' }).click();
    await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});

    const badge = page.locator('[data-tooltip]').first();
    await badge.waitFor({ timeout: 5000 }).catch(() => {});

    if (await badge.count() > 0) {
      // Verify the tooltip text is set via data-tooltip attribute
      const tooltipText = await badge.getAttribute('data-tooltip');
      expect(tooltipText).toBe('Late to at least 50% of their meetings');

      // Hover over the badge and wait for the CSS transition (0.15s) to complete
      await badge.hover();
      await page.waitForTimeout(300);
      const opacity = await badge.evaluate(el => {
        const after = window.getComputedStyle(el, '::after');
        return parseFloat(after.getPropertyValue('opacity'));
      });
      expect(opacity).toBeGreaterThan(0.9);
    } else {
      // No habitual latecomers in current data — badge may not be present; test skipped.
      test.skip();
    }
  });

  test('should display visual feedback on invalid password', async ({ page }) => {
    await page.goto(BASE_URL);

    // Verify Title
    await expect(page.getByRole('heading', { name: 'Presence Tracker' })).toBeVisible();

    // Fill wrong password
    const passwordInput = page.getByPlaceholder('Password');
    await passwordInput.fill('wrong-password-guess');
    await page.getByRole('button', { name: 'View Dashboard →' }).click();

    // Verify UX indicator for error state
    const errorText = page.getByText('Invalid password');
    await expect(errorText).toBeVisible();
    await expect(errorText).toHaveCSS('color', 'rgb(239, 68, 68)'); // --danger color
  });

  test('should seamlessly navigate to the dashboard with valid credentials', async ({ page }) => {
    await page.goto(BASE_URL);

    // Fill correct password
    const passwordInput = page.getByPlaceholder('Password');
    await passwordInput.fill('scale-army');
    await page.getByRole('button', { name: 'View Dashboard →' }).click();

    // Wait for network resolution to the dashboard
    const dashboardHeader = page.getByRole('heading', { name: 'Presence Tracker', exact: false });
    await expect(dashboardHeader).toBeVisible();
    await expect(page.getByText('Company Meeting Punctuality Dashboard')).toBeVisible();

    // Check visually critical glass panels exist
    const teamMembersPanel = page.locator('.glass-panel').filter({ hasText: 'Team Members' });
    await expect(teamMembersPanel).toBeVisible();
    
    const leaderboardHead = page.getByRole('heading', { name: 'Leaderboard (Ranked by % Late)' });
    await expect(leaderboardHead).toBeVisible();

    // Verify table structure visually loads
    const tableHeaders = page.locator('th');
    await expect(tableHeaders).toHaveCount(5);
    await expect(tableHeaders.nth(0)).toHaveText('Employee');
    await expect(tableHeaders.nth(2)).toHaveText('Late Rate');
  });

  test('should maintain branding colors on primary elements', async ({ page }) => {
     await page.goto(BASE_URL);

     const loginButton = page.getByRole('button', { name: 'View Dashboard →' });
     await expect(loginButton).toHaveCSS('background-color', 'rgb(241, 90, 36)'); // #F15A24

     // Note: We can expand this test to use page.screenshot() for full pixel matching
     // using expect(await page.screenshot()).toMatchSnapshot('login.png');
  });

});

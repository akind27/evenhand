import { expect, test } from '@playwright/test';
import { pickupToHold, returnWithSamples, startDemo } from './helpers';

test('clean return: the deposit is released and nothing is charged', async ({ page, browser }) => {
  await startDemo(page);
  const { renter, renterContext } = await pickupToHold(page, browser);

  await returnWithSamples(page, 'Sample: no new marks');

  // Recorded AI answers are empty for now, so the comparison either finds nothing or says it could not run.
  await expect(page.getByText(/No new marks were found|The AI comparison was not available/)).toBeVisible();
  await expect(page.getByTestId('total')).toContainText('Charge €0.00');

  await page.getByRole('button', { name: 'Release deposit' }).click();
  await page.getByRole('button', { name: 'Yes, release' }).click();
  await expect(page.getByText('The deposit was released. Nothing was charged.')).toBeVisible();

  // The renter's page polls, so it catches up on its own.
  await expect(renter.getByText('No new damage. Your deposit is released.')).toBeVisible();
  await renter.goto(`/record/${page.url().split('/h/')[1]}`);
  await expect(renter.getByText('Hold released. Nothing was charged.').first()).toBeVisible();
  await expect(renter.getByText('Record intact', { exact: true })).toBeVisible();

  await renterContext.close();
});

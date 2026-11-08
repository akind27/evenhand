import { expect, test, type Page } from '@playwright/test';
import { pickupToHold, returnWithSamples, startDemo } from './helpers';

/** The renter sees €50, accepts, and both sides see €50 charged and €100 released. Then the record is checked. */
async function renterAcceptsAndEveryoneAgrees(shop: Page, renter: Page): Promise<void> {
  const handoverId = shop.url().split('/h/')[1];

  await expect(shop.getByRole('heading', { name: 'Waiting for the renter' })).toBeVisible();
  await expect(shop.getByText('€50.00', { exact: true })).toBeVisible();

  await expect(renter.getByTestId('charge-total')).toHaveText('€50.00');
  await renter.getByRole('button', { name: 'Accept €50.00' }).click();
  // The second tap says exactly what happens (M5).
  await renter.getByRole('button', { name: 'Tap again to confirm €50.00' }).click();

  await expect(renter.getByText('You accepted. €50.00 was taken from the hold and €100.00 was released to you.')).toBeVisible();
  await expect(renter.getByText('Charged €50.00')).toBeVisible();
  await expect(shop.getByText('€50.00 was charged and €100.00 of the hold was released.')).toBeVisible();

  await renter.goto(`/record/${handoverId}`);
  await expect(renter.getByText('€50.00 charged; €100.00 released.').first()).toBeVisible();
  await expect(renter.getByText('Record intact', { exact: true })).toBeVisible();
}

// Needs the recorded answers from scripts/record-demo-answers.ts.
test.fixme('damaged return: the AI finds the mirror and the scratch', async ({ page, browser }) => {
  await startDemo(page);
  const { renter, renterContext } = await pickupToHold(page, browser);

  await returnWithSamples(page, 'Sample: new marks');
  await expect(page.getByText('The AI comparison was not available')).toHaveCount(0);

  // Confirm the mirror (€30) and the scratch (€20). Dismiss anything else.
  const undecided = page.getByRole('listitem').filter({ has: page.getByRole('button', { name: 'Dismiss' }) });
  expect(await undecided.count()).toBeGreaterThan(0);
  while ((await undecided.count()) > 0) {
    const card = undecided.first();
    const before = await undecided.count();
    const text = (await card.innerText()).toLowerCase();
    if (text.includes('mirror')) {
      await card.getByLabel(/^Price item/).selectOption({ label: 'Mirror — €30.00' });
      await card.getByRole('button', { name: 'Confirm', exact: true }).click();
    } else if (text.includes('scratch')) {
      await card.getByLabel(/^Price item/).selectOption({ label: 'Scratch on a body panel — €20.00' });
      await card.getByRole('button', { name: 'Confirm', exact: true }).click();
    } else {
      await card.getByRole('button', { name: 'Dismiss' }).click();
    }
    await expect(undecided).toHaveCount(before - 1);
  }
  await expect(page.getByTestId('total')).toContainText('€50.00');

  await page.getByRole('button', { name: 'Send to renter for approval' }).click();
  await renterAcceptsAndEveryoneAgrees(page, renter);
  await renterContext.close();
});

// Same money path without the AI: the shop adds the two findings by hand from the price list.
test('damaged return (manual findings): charged €50, released €100', async ({ page, browser }) => {
  await startDemo(page);
  const { renter, renterContext } = await pickupToHold(page, browser);

  await returnWithSamples(page, 'Sample: new marks');
  await expect(page.getByText('The AI comparison was not available')).toBeVisible();

  await addByHand(page, { side: 'left', where: 'Left mirror', what: 'Mirror glass is cracked', price: 'Mirror — €30.00' });
  await addByHand(page, { side: 'right', where: 'Right body panel', what: 'A long scratch in the paint', price: 'Scratch on a body panel — €20.00' });
  await expect(page.getByRole('heading', { name: /Left mirror/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Right body panel/ })).toBeVisible();
  await expect(page.getByTestId('total')).toContainText('€50.00');
  await expect(page.getByTestId('total')).toContainText('Charge €50.00');
  await expect(page.getByTestId('total')).toContainText('Released €100.00');

  await page.getByRole('button', { name: 'Send to renter for approval' }).click();
  await renterAcceptsAndEveryoneAgrees(page, renter);
  await renterContext.close();
});

interface ByHand {
  side: 'left' | 'right';
  where: string;
  what: string;
  price: string;
}

async function addByHand(page: Page, finding: ByHand): Promise<void> {
  await page.getByRole('button', { name: 'Add damage by hand' }).click();
  // Earlier findings have their own price pickers, so stay inside the form.
  const form = page.locator('form').filter({ has: page.getByLabel('Where on the item') });
  await form.getByLabel(/^Side/).selectOption(finding.side);
  await form.getByLabel('Where on the item').fill(finding.where);
  await form.getByLabel('What you see').fill(finding.what);
  await form.getByLabel(/^Price item/).selectOption({ label: finding.price });
  // The button sits in the bottom bar and is tied to the form by its form attribute.
  await page.getByRole('button', { name: 'Add finding' }).click();
  await expect(page.getByRole('heading', { name: new RegExp(finding.where) })).toBeVisible();
}

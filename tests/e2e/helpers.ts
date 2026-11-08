import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** The four angles in the order the guided capture asks for them. */
const ANGLES = ['Front', 'Back', 'Left side', 'Right side'] as const;

export type ReturnSet = 'Sample: new marks' | 'Sample: no new marks';

export interface Rental {
  shop: Page;
  renter: Page;
  renterContext: BrowserContext;
}

/** A second browser context for the renter, with the same device settings as the shop. It shares no cookies with the shop. */
export async function openRenterContext(browser: Browser): Promise<BrowserContext> {
  const use = test.info().project.use;
  return browser.newContext({
    baseURL: use.baseURL,
    viewport: use.viewport ?? undefined,
    userAgent: use.userAgent,
    deviceScaleFactor: use.deviceScaleFactor,
    isMobile: use.isMobile,
    hasTouch: use.hasTouch,
    locale: 'en-US',
  });
}

/** Landing page, then "Try the demo". Ends on the shop home. */
export async function startDemo(shop: Page): Promise<void> {
  await shop.goto('/');
  await shop.getByRole('button', { name: 'Try the demo' }).click();
  await expect(shop).toHaveURL(/\/shop\/[^/]+$/);
  await expect(shop.getByRole('button', { name: 'New handover' })).toBeEnabled();
}

/** Presses "Use sample photo" once per angle and waits for each box to say done. */
async function captureFourSamples(page: Page): Promise<void> {
  for (const angle of ANGLES) {
    await page.getByRole('button', { name: 'Use sample photo' }).click();
    await expect(page.getByRole('button', { name: `${angle}, done` })).toBeVisible();
  }
}

/** New handover, four sample photos, condition, deposit, share. Returns the renter link. */
async function createAndShare(shop: Page): Promise<string> {
  await shop.getByRole('button', { name: 'New handover' }).click();
  // The labels carry a Greek twin after the English words, so match the start only.
  await shop.getByLabel(/^Item/).selectOption({ label: '125cc scooter' });
  await shop.getByLabel(/^Reference, such as the plate/).fill('ΚΡΑ-1234');
  await shop.getByRole('button', { name: 'Start handover' }).click();
  await expect(shop).toHaveURL(/\/h\/[^/]+$/);

  await captureFourSamples(shop);

  await shop.getByRole('button', { name: 'Record condition' }).click();
  await expect(shop.getByRole('button', { name: /^125cc scooter.*€150/ })).toBeVisible();
  await shop.getByRole('button', { name: /^125cc scooter.*€150/ }).click();
  await expect(shop.getByRole('button', { name: /^125cc scooter.*€150/ })).toHaveAttribute('aria-pressed', 'true');

  await shop.getByRole('button', { name: 'Share with renter' }).click();
  const link = shop.getByRole('link', { name: 'Open renter view' });
  await expect(link).toBeVisible();
  const href = await link.getAttribute('href');
  expect(href, 'the renter link carries the secret after #t=').toContain('#t=');
  return href as string;
}

/** The renter confirms the record and simulates the PayPal hold. */
async function renterHolds(renter: Page, href: string): Promise<void> {
  await renter.goto(href);
  await renter.getByRole('button', { name: 'I checked the photos' }).click();
  await renter.getByRole('button', { name: 'Simulate PayPal hold (demo mode)' }).click();
  await expect(renter.getByText('Your deposit is reserved. Bring the item back to the shop when you are done.')).toBeVisible();
}

/** Pickup all the way to a held deposit. The shop ends with the "Start return" button showing. */
export async function pickupToHold(shop: Page, browser: Browser): Promise<Rental> {
  const href = await createAndShare(shop);
  const renterContext = await openRenterContext(browser);
  const renter = await renterContext.newPage();
  await renterHolds(renter, href);
  await expect(shop.getByRole('button', { name: 'Start return' })).toBeVisible();
  return { shop, renter, renterContext };
}

/** Start the return, pick a sample set, capture four photos and compare. Ends on the return review. */
export async function returnWithSamples(shop: Page, set: ReturnSet): Promise<void> {
  await shop.getByRole('button', { name: 'Start return' }).click();
  await shop.getByRole('button', { name: set }).click();
  await expect(shop.getByRole('button', { name: set })).toHaveAttribute('aria-pressed', 'true');
  await captureFourSamples(shop);
  await shop.getByRole('button', { name: 'Compare with pickup photos' }).click();
  await expect(shop.getByRole('heading', { name: 'Return review' })).toBeVisible();
}

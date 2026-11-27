import { expect, type Browser, type Page } from '@playwright/test'

export const MENTOR_NICK = process.env.E2E_MENTOR_NICK ?? 'prof.e2e'
export const MENTOR_PASS = process.env.E2E_MENTOR_PASS ?? 'demo1234'

/** Telefon: iPhone-ova širina 390 px, dodir. */
export async function phone(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
  return ctx.newPage()
}

/** Cijeli tok učesnika: Uđi → prvo ponuđeno ime → oznake → Gotovo. Vraća izabrano ime. */
export async function join(page: Page, tags: string[], query = ''): Promise<string> {
  await page.goto('./#/' + query)
  await page.getByTestId('enter').click()
  const first = page.getByTestId('nick-option').first()
  await expect(first).toBeVisible()
  const nick = (await first.innerText()).trim()
  await first.click()
  await expect(page.getByRole('heading', { name: 'Šta te zanima?' })).toBeVisible()
  for (const t of tags) await page.getByTestId(`tag-${t}`).click()
  await page.getByTestId('done').click()
  await expect(page.getByTestId('invite-card')).toBeVisible()
  return nick
}

export async function mentor(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await ctx.newPage()
  await page.goto('./#/admin')
  await page.getByLabel('Nik').fill(MENTOR_NICK)
  await page.getByLabel('Lozinka').fill(MENTOR_PASS)
  await page.getByRole('button', { name: 'Prijavi se' }).click()
  await expect(page.getByRole('heading', { name: 'Mentor' })).toBeVisible()
  await expect(page.getByTestId('a-people')).toBeVisible()
  return page
}

export async function reset(admin: Page) {
  await admin.getByTestId('reset').click()
  await admin.getByTestId('reset-confirm').click()
  await expect(admin.getByText('Demo je vraćen na početak.')).toBeVisible()
  await expect(admin.getByTestId('a-people')).toHaveText('0')
}

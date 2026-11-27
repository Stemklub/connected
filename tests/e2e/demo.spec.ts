// Cijeli demo: telefon (390 px), platno (1920×1080), admin (reset, prijave, moderacija, CSV), izvor stand.
import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { join, mentor, phone, reset } from './helpers'

test.describe.configure({ mode: 'serial' })

test('telefon: Uđi → ime → interesovanja → poziv → tim; osvježavanje ne pravi novi nalog', async ({ browser }) => {
  const admin = await mentor(browser)
  await reset(admin)

  const p = await phone(browser)
  const t0 = Date.now()
  const nick = await join(p, ['robotika', 'muzika'])
  const card = p.getByTestId('invite-card')
  await expect(card.getByRole('heading')).toHaveText(/^Trebaš nam u (robotičkom|muzičkom) timu\.$/)
  await expect(card.getByTestId('invite-why')).toHaveText(/Zašto ti: (Robotika|Muzika)/)
  await card.getByRole('button', { name: 'Pridružujem se' }).click()
  await expect(p.getByRole('heading', { name: 'Moji timovi' })).toBeVisible()
  await expect(p.getByTestId('team-card').first()).toContainText(nick)
  // pregled tima: dodir otvara tim sa svim članovima
  await p.getByTestId('team-card').first().click()
  await expect(p.getByTestId('team-page')).toBeVisible()
  await expect(p.getByTestId('team-members')).toContainText(`${nick}(ti)`)
  await expect(p.getByTestId('team-count')).toHaveText('1 član')
  await p.getByRole('button', { name: 'Nazad' }).click()
  await expect(p.getByRole('heading', { name: 'Moji timovi' })).toBeVisible()
  test.info().annotations.push({ type: 'trajanje toka', description: `${Date.now() - t0} ms` })

  // nema horizontalnog skrolovanja na 390 px
  const overflow = await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)

  await p.reload()
  await p.getByTestId('nav-profile').click()
  await expect(p.getByTestId('profile-nick')).toHaveText(nick)
  const code = (await p.getByTestId('my-code').innerText()).trim()
  expect(code).toMatch(/^[A-Z0-9]{5}$/)

  // „Imam kod“ na drugom telefonu: isti učesnik
  const p2 = await phone(browser)
  await p2.goto('./#/')
  await p2.getByTestId('have-code').click()
  await p2.getByTestId('code-input').fill(code)
  await p2.getByRole('button', { name: 'Nastavi' }).click()
  await expect(p2.getByRole('heading', { name: 'Za tebe' })).toBeVisible()
  await p2.getByTestId('nav-profile').click()
  await expect(p2.getByTestId('profile-nick')).toHaveText(nick)

  await expect(admin.getByTestId('a-people')).toHaveText('1', { timeout: 20_000 })
  await expect(admin.getByTestId('a-joined')).toHaveText('1')
  await p.screenshot({ path: 'test-results/telefon.png' })
})

test('„Ne sada“ → „Za tebe“ i ručno pridruživanje', async ({ browser }) => {
  const p = await phone(browser)
  await join(p, ['nauka'])
  await p.getByTestId('invite-card').getByRole('button', { name: 'Ne sada' }).click()
  await expect(p.getByRole('heading', { name: 'Za tebe' })).toBeVisible()
  await expect(p.getByTestId('invite-card')).toHaveCount(0)
  // pregled tima iz „Za tebe“, pa pridruživanje sa ekrana tima
  await p.getByTestId('team-card').filter({ hasText: 'Eksperimenti za Dan nauke' }).click()
  await expect(p.getByTestId('team-page')).toBeVisible()
  await p.getByRole('button', { name: 'Nazad' }).click()
  await p.getByTestId('team-card').filter({ hasText: 'Eksperimenti za Dan nauke' }).getByTestId('join').click()
  await expect(p.getByRole('heading', { name: 'Moji timovi' })).toBeVisible()
  await expect(p.getByTestId('team-card')).toContainText('Eksperimenti za Dan nauke')
})

test('platno 1920×1080: brojevi, timovi i zid se mijenjaju uživo', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } })
  const screen = await ctx.newPage()
  await screen.goto('./#/platno')
  await expect(screen.getByTestId('screen-team')).toHaveCount(9)
  const before = Number(await screen.getByTestId('screen-joined').innerText())

  const p = await phone(browser)
  const nick = await join(p, ['ekologija'])
  await p.getByTestId('invite-card').getByRole('button', { name: 'Pridružujem se' }).click()

  await expect(screen.getByTestId('screen-joined')).toHaveText(String(before + 1), { timeout: 20_000 })
  await expect(screen.getByTestId('wall-item').first()).toContainText(`${nick} se pridružuje eko timu`)
  await expect(screen.locator('.qr svg')).toBeVisible()
  const overflow = await screen.evaluate(() => [document.documentElement.scrollWidth - innerWidth, document.documentElement.scrollHeight - innerHeight])
  expect(overflow[0]).toBeLessThanOrEqual(0)
  expect(overflow[1]).toBeLessThanOrEqual(0)
  await screen.screenshot({ path: 'test-results/platno.png' })
})

test('admin: prijave, moderacija predloga, izvor stand, CSV i reset', async ({ browser }) => {
  const admin = await mentor(browser)

  // zatvorene prijave → jasna poruka na novom telefonu
  await admin.getByTestId('registrations').click()
  await expect(admin.getByText('Prijave su zatvorene')).toBeVisible()
  const closed = await phone(browser)
  await closed.goto('./#/')
  await closed.getByTestId('enter').click()
  await expect(closed.getByTestId('enter-error')).toHaveText(/Prijave su trenutno zatvorene/)
  await admin.getByTestId('registrations').click()
  await expect(admin.getByText('Prijave su otvorene')).toBeVisible()

  // izvor stand
  const s = await phone(browser)
  await join(s, ['ideje'], '?izvor=stand')
  await s.getByTestId('invite-card').getByRole('button', { name: 'Pridružujem se' }).click()
  await expect(s.getByRole('heading', { name: 'Moji timovi' })).toBeVisible()

  // predlog → mentor odobrava → tim postoji
  await s.getByTestId('propose-open').click()
  await s.getByLabel('Naslov').fill('Bend STEM kluba')
  await s.getByLabel('Jedna rečenica').fill('Sviramo na završnoj večeri.')
  await s.getByRole('button', { name: /Muzika/ }).click()
  await s.getByRole('button', { name: 'Pošalji mentoru' }).click()
  await expect(s.getByTestId('proposal')).toContainText('Čeka mentora')
  await admin.reload()
  const prop = admin.getByTestId('pending-proposal').filter({ hasText: 'Bend STEM kluba' })
  await expect(prop).toBeVisible()
  await prop.getByTestId('approve').click()
  await expect(prop).toBeHidden()
  await s.reload()
  await expect(s.getByTestId('team-card').filter({ hasText: 'Bend STEM kluba' })).toBeVisible()

  // CSV
  const dl = admin.waitForEvent('download')
  await admin.getByTestId('csv').click()
  const csv = readFileSync(await (await dl).path(), 'utf8')
  expect(csv.split('\n')[0]).toBe('izvor,prijave,pridruzivanja')
  expect(csv).toMatch(/^stand,1,2$/m)
  expect(csv).not.toMatch(/[A-Z][a-z]+ [A-Z][a-z]+/) // bez nikova

  // reset: učesnik se vraća na ulaz
  await reset(admin)
  await s.reload()
  await expect(s.getByTestId('enter')).toBeVisible()
  await s.getByTestId('enter').click()
  await expect(s.getByTestId('nick-option').first()).toBeVisible()
})

// Prilike van škole (offline režim): „Za tebe“, „Van škole“ tab, prijava, tim za priliku,
// mentor objavljuje priliku, zvonce. „Trebaš nam“ se ne prikazuje na „Van škole“.
import { expect, test, type Page } from '@playwright/test'
import { register } from './helpers'

async function switchTo(page: Page, nick: string) {
  await page.getByTestId('switch-account').click()
  await page.getByTestId('account-menu').getByRole('button', { name: new RegExp(nick) }).click()
  await page.waitForTimeout(400) // prebacivanje naloga mijenja ekran sa kratkim zakašnjenjem
}

test('offline: prilike van škole', async ({ page }) => {
  // Učenica voli crtanje (→ poziv za mural) i zna foto i video (→ prilike za video)
  await register(page, '3201', 'luna.video', ['video:znam', 'crtanje'])
  const invite = page.getByTestId('invite-card')
  await expect(invite).toBeVisible()

  // Na „Van škole“ kartica poziva se ne prikazuje
  await page.goto('./#/?tab=van')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Van škole', level: 1 })).toBeVisible()
  await expect(page.getByTestId('opportunity-card')).toHaveCount(8)
  await page.waitForTimeout(1500)
  await expect(invite).toBeHidden()
  // „Za tebe“ prilike su prve
  const first = page.getByTestId('opportunity-card').first()
  await expect(first.getByTestId('for-me')).toBeVisible()
  await expect(page.getByTestId('opportunity-card').last().getByTestId('for-me')).toHaveCount(0)

  // „Sve“: sekcija „Van škole · za tebe“ (do 2) iznad „U školi“; poziv se sada pojavljuje
  await page.getByRole('tab', { name: 'Sve' }).click()
  await expect(invite).toBeVisible()
  await invite.getByRole('button', { name: 'Ne sada' }).click()
  const section = page.getByTestId('out-for-you')
  await expect(section.getByRole('heading', { name: 'Van škole · za tebe' })).toBeVisible()
  await expect(section.getByTestId('opportunity-card')).toHaveCount(2)
  await expect(page.getByRole('heading', { name: 'U školi' })).toBeVisible()

  // Zvonce prikazuje prilike koje odgovaraju učenici
  await expect(page.getByTestId('bell-dot')).toBeVisible()
  await page.getByTestId('bell').click()
  await expect(page.getByText(/Prilika za tebe: „Radionica: snimanje i montaža telefonom“/)).toBeVisible()
  await page.getByText(/Prilika za tebe: „Radionica: snimanje i montaža telefonom“/).click()

  // Detalj: rok, mjesto, za koga, opis + dugmad
  await expect(page.getByTestId('opportunity-title')).toHaveText('Radionica: snimanje i montaža telefonom')
  for (const t of ['Rok', 'Mjesto', 'Za koga']) await expect(page.getByText(t, { exact: true })).toBeVisible()
  await expect(page.getByText(/Objavio\/la: Mentorka sekcije/)).toBeVisible()
  await page.getByTestId('opp-interest').click()
  await expect(page.getByTestId('opp-interest')).toHaveText(/Prijavljen\/a · poništi/)

  // „Ko ide sa mnom? Napravi tim“ → popunjen obrazac → mentoru na odobrenje
  await page.getByTestId('opp-team').click()
  await expect(page.getByTestId('np-opportunity')).toContainText('Radionica: snimanje i montaža telefonom')
  await expect(page.getByTestId('np-title')).toHaveValue('Tim za: Radionica: snimanje i montaža telefonom')
  await page.getByTestId('np-submit').click()
  await expect(page.getByText('Čeka mentora')).toBeVisible()

  // Mentor odobrava tim i objavljuje novu priliku
  await switchTo(page, 'Profesorka')
  const pending = page.getByTestId('pending-project').filter({ hasText: 'Tim za: Radionica' })
  await pending.getByTestId('approve').click()
  await expect(pending).toBeHidden()
  await page.getByTestId('publish-opp-open').click()
  const form = page.getByTestId('publish-opp')
  await form.getByLabel('Naziv').fill('Filmski kamp za srednjoškolce')
  await form.getByRole('button', { name: /Radionica/ }).click()
  await form.getByLabel('Organizator').fill('Kino klub')
  await form.getByLabel('Mjesto').fill('Kotor')
  await form.getByLabel('Za koga').fill('Svi razredi')
  await form.getByLabel('Opis').fill('Sedam dana snimanja i montaže kratkog filma.')
  await form.getByRole('button', { name: /Foto i video/ }).click()
  await form.getByRole('button', { name: 'Objavi' }).click()
  await expect(form).toBeHidden()

  // Učenica: novo obavještenje i tim vezan za priliku
  await switchTo(page, 'luna.video')
  await expect(page.getByTestId('bell-dot')).toBeVisible()
  await page.getByTestId('bell').click()
  await expect(page.getByText(/Prilika za tebe: „Filmski kamp za srednjoškolce“/)).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('./#/timovi')
  await page.getByTestId('project-card').filter({ hasText: 'Tim za: Radionica' }).click()
  await page.getByTestId('project-opportunity').click()
  await expect(page.getByRole('heading', { name: 'Timovi za ovu priliku' })).toBeVisible()
  await expect(page.getByText('✓ Prijavljen/a').first()).toBeVisible()
})

// v1 je ovdje imao service worker za offline režim. v2 ga nema.
// Ovaj fajl ostaje samo da bi pregledači koji imaju stari SW dobili ovu verziju:
// briše keš, odjavljuje se i osvježava otvorene stranice.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys()) await caches.delete(k)
      await self.registration.unregister()
      const clients = await self.clients.matchAll({ type: 'window' })
      for (const c of clients) c.navigate(c.url)
    })(),
  )
})

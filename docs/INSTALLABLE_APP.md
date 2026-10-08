# Installable App (PWA)

Cydex can be installed on phones and computers like an app: its own icon, no browser bar, a splash screen, an offline page and push notifications. As of October 2026.

## What users see

| Device | How to install |
|---|---|
| **Android** (Chrome, Edge, Samsung Internet) | A banner at the bottom of the screen with an **Install** button, or **Install app** in the side menu. Chrome's own menu also has "Install app". |
| **iPhone / iPad** (Safari) | Apple allows no install button. The banner and **Install app** menu item show the steps instead: **Share → Add to Home Screen**. This is also what unlocks push notifications on iPhone. |
| **Computer** (Chrome, Edge) | The install icon in the address bar, or **Install app** in the side menu. |

- **Banner timing:** the banner only shows on phone-sized screens and never once the app is installed. **Not now** hides it for two weeks; the menu item stays.
- **Installed app:**
  - opens full-screen in portrait, with the Cydex icon and a white splash screen;
  - long-pressing the icon on Android offers **My orders** and **Notifications** shortcuts;
  - Android's install dialog shows the screenshots in `public/screenshots/`.

## Offline

With no connection, opening any page shows a friendly **"You're offline"** page (`public/offline.html`) with a **Try again** button. It reloads by itself when the connection comes back.

Only the app's own files are cached:
- the versioned build files in `/assets/`, which load instantly on the next visit;
- the icons;
- the offline page.

Orders, wallets, products and anything else from Supabase, Google or Squad are **never cached**: they always come live from the network.

## Files

| File | What it is |
|---|---|
| `public/manifest.webmanifest` | App name, colours, start page (`/auth`: the login page, which sends signed-in users to their dashboard), icons, screenshots, shortcuts |
| `public/sw.js` | Service worker: offline page, caching of build files, push notifications |
| `public/offline.html` | The offline page |
| `public/icons/` | App icons (192/512, maskable versions for Android's shaped icons, monochrome, iPhone 180×180, favicons), made from `public/og-tab.png` on the brand green `#6CE000` |
| `public/splash/` | iPhone launch screens for current models, linked from `index.html` |
| `public/screenshots/` | Screenshots shown in Android's install dialog |
| `src/lib/pwa.ts` | Registers the service worker on every visit; keeps Android's install prompt for our own button |
| `src/components/pwa/` | The install banner, the **Install app** menu item, and the iPhone steps |
| `vercel.json` | Headers: `sw.js` never cached by the browser (so updates arrive), the manifest's content type, long caching for `/assets/` |

## Updating

- **App changes:** just deploy. Build files have new names each time, and the service worker is never browser-cached.
- **Changing `sw.js` itself:** bump `VERSION` at the top so old caches are cleared.
- **New icon:** replace `public/og-tab.png` with a square logo, then regenerate `public/icons/` and `public/splash/` (the sizes are listed in this file and in `index.html`).
- **Refreshing screenshots:** capture at 1080×2340 for phones and 1920×1080 for wide screens. Keep the sizes in the manifest matching.

## Requirements

- **HTTPS:** Vercel provides it. Installing doesn't work over plain http, except on `localhost`.
- **Testing on a phone:** use the deployed site, or an HTTPS tunnel to your computer. A phone can't install from `http://192.168.x.x`.

# Naywall (Firefox)

Same extension as the Chrome version, ported to Firefox's WebExtensions
API (`browser.*` instead of `chrome.*`) and Manifest V3 as implemented
by Firefox 109+.

What it does when you click the toolbar icon on the current tab:

- Removes elements whose `id`/`class` contains "paywall" (case-insensitive)
- Also removes elements that *look* like metered/subscription overlays
  (name matches a common paywall-widget pattern **and** the element is
  fixed/sticky-positioned or covers most of the viewport)
- Un-sticks scrolling: fixes `position: fixed` / `overflow: hidden` on
  `<html>`/`<body>`, and walks up from the article/`<main>` content to
  free any wrapping `<div>` that's actually clipping scroll
- Strips "fade-to-white/black" gradient bands sitting over truncated text
- Re-enables text selection if a wall disabled copy/paste
- Watches for 15 seconds after activation in case the site re-injects its
  paywall DOM, then stops watching

It runs on-demand only — nothing happens until you click "Clean this
page" in the popup.

## Load it temporarily (easiest, for personal use)

1. Open Firefox and go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select the `manifest.json` file inside this `naywall-firefox` folder
4. Pin the extension, open an article, click the Naywall icon, then
   **Clean this page**

Note: temporary add-ons are removed when Firefox restarts — you'll need
to reload it each session. This is a Firefox limitation for unsigned
extensions, not something specific to Naywall.

## Load it permanently

Firefox normally requires an extension to be signed by Mozilla (via
addons.mozilla.org) to install permanently in regular Firefox. Two
options:

- **Self-distribute, signed**: submit the folder (zipped) to AMO as an
  "unlisted" add-on — you'll get back a signed `.xpi` you can install
  and that will persist across restarts, without it being publicly
  listed.
- **Firefox Developer Edition / Nightly**: these builds let you flip
  `xpinstall.signatures.required` to `false` in `about:config` and load
  unsigned `.xpi`s permanently. Not recommended for your main browser
  profile.

## Notes

- This edits the page's DOM/CSS locally in your browser — it doesn't
  fetch, unlock, or bypass any server-side access control, so it won't
  help with hard paywalls that never send the full article content to
  your browser in the first place.
- If a site changes its markup, the heuristics might occasionally miss
  something, or in rare cases remove more than intended. Reload the page
  to undo everything.

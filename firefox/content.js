/**
 * Naywall content script.
 * Injected on-demand (when the user clicks the toolbar icon) rather than
 * running on every page automatically, so it never touches sites you
 * haven't asked it to.
 */
(() => {
  if (window.__naywallActive) {
    // Already running on this page — just re-run a pass instead of
    // stacking a second observer.
    window.__naywallRun();
    return;
  }
  window.__naywallActive = true;

  const REMOVE_SELECTORS = [
    '[id*="paywall" i]',
    '[class*="paywall" i]',
  ];

  // Extra, more conservative patterns for common soft-paywall / metered
  // overlay widgets. These only fire on elements that ALSO look like
  // overlays (fixed/sticky position, or covering a large chunk of the
  // viewport) so we don't accidentally nuke unrelated page content that
  // simply has one of these words in a class name.
  const OVERLAY_HINT_PATTERNS = [
    /paywall/i,
    /metered?[-_]?wall/i,
    /subscri(be|ption)[-_]?wall/i,
    /piano[-_]?inline/i,
    /reg[-_]?wall/i,
    /gate(way)?[-_]?overlay/i,
  ];

  let removedCount = 0;
  let unlockedCount = 0;
  let gradientCount = 0;

  const log = (...args) => console.log('[Naywall]', ...args);

  function removeExplicitPaywallElements(root = document) {
    for (const selector of REMOVE_SELECTORS) {
      root.querySelectorAll(selector).forEach((el) => {
        if (el.isConnected) {
          el.remove();
          removedCount++;
        }
      });
    }
  }

  function elementCoversViewport(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    const viewportArea = window.innerWidth * window.innerHeight;
    const elArea = rect.width * rect.height;
    // Covers at least 55% of the visible viewport.
    return elArea / viewportArea > 0.55;
  }

  function looksLikeOverlay(el) {
    const style = getComputedStyle(el);
    const isPositioned = style.position === 'fixed' || style.position === 'sticky';
    const highZ = parseInt(style.zIndex, 10);
    const hasHighZ = !Number.isNaN(highZ) && highZ >= 100;
    return (isPositioned || hasHighZ) && elementCoversViewport(el);
  }

  function removeSuspiciousOverlays(root = document) {
    const candidates = root.querySelectorAll('div, aside, section');
    candidates.forEach((el) => {
      if (!el.isConnected) return;
      const idClass = `${el.id} ${el.className}`;
      const nameMatches = OVERLAY_HINT_PATTERNS.some((re) => re.test(idClass));
      if (nameMatches && looksLikeOverlay(el)) {
        el.remove();
        removedCount++;
      }
    });
  }

  function unlockScrolling() {
    // The two most common culprits: <body> and <html> get position:fixed
    // or overflow:hidden applied while a paywall/modal is showing, and
    // never get released once you scroll past the fold.
    [document.documentElement, document.body].forEach((el) => {
      if (!el) return;
      const style = getComputedStyle(el);
      let touched = false;
      if (style.position === 'fixed') {
        el.style.setProperty('position', 'static', 'important');
        touched = true;
      }
      if (style.overflow === 'hidden' || style.overflowY === 'hidden') {
        // 'auto' isn't reliable here — some sites' layout only actually
        // regains scrollability with 'scroll' explicitly forced.
        el.style.setProperty('overflow', 'scroll', 'important');
        touched = true;
      }
      if (style.height === '100%' && el === document.body) {
        // Sites sometimes pin body height to the viewport to prevent
        // scrolling past it; relax that too.
        el.style.setProperty('height', 'auto', 'important');
        touched = true;
      }
      if (touched) unlockedCount++;
    });

    // Some sites lock scrolling on a wrapper div (e.g. #root, .app,
    // .site-wrapper) instead of body. Walk from the likely article
    // container upward and free any ancestor that's clipping overflow.
    const article =
      document.querySelector('article') ||
      document.querySelector('main') ||
      document.querySelector('[role="main"]');

    if (article) {
      let node = article.parentElement;
      let hops = 0;
      while (node && node !== document.documentElement && hops < 25) {
        const style = getComputedStyle(node);
        if (
          (style.overflow === 'hidden' || style.overflowY === 'hidden') &&
          node.scrollHeight > node.clientHeight
        ) {
          node.style.setProperty('overflow', 'visible', 'important');
          unlockedCount++;
        }
        if (style.maxHeight && style.maxHeight !== 'none') {
          const maxH = parseFloat(style.maxHeight);
          if (!Number.isNaN(maxH) && node.scrollHeight > maxH) {
            node.style.setProperty('max-height', 'none', 'important');
            unlockedCount++;
          }
        }
        node = node.parentElement;
        hops++;
      }
    }

    // Re-enable text selection if a paywall disabled it (common
    // anti-copy-paste measure that often ships alongside the wall).
    if (getComputedStyle(document.body).userSelect === 'none') {
      document.body.style.setProperty('user-select', 'auto', 'important');
    }
  }

  function removeFadeGradients(root = document) {
    let gradientCount = 0;
    const candidates = root.querySelectorAll('*');

    // Stylesheet used to disable offending pseudo-elements.
    let styleSheet = document.getElementById('gradient-remover-style');

    if (!styleSheet) {
        styleSheet = document.createElement('style');
        styleSheet.id = 'gradient-remover-style';
        document.head.appendChild(styleSheet);
    }

    // Give an element a unique ID that can safely be used in CSS.
    const getElementId = (el) => {
        let id = el.getAttribute('data-gradient-remover-id');

        if (!id) {
            id = 'gr-' + Math.random().toString(36).slice(2);
            el.setAttribute('data-gradient-remover-id', id);
        }

        return id;
    };

    const checkPseudo = (el, pseudo) => {
        const style = getComputedStyle(el, pseudo);
        const bg = style.backgroundImage || '';

        if (!/gradient/i.test(bg))
            return;

        const id = getElementId(el);

        // Don't add the same rule repeatedly.
        const rule = `[data-gradient-remover-id="${id}"]${pseudo}`;
        const rules = styleSheet.sheet.cssRules;

        for (const existing of rules) {
            if (existing.selectorText === rule)
                return;
        }

        styleSheet.sheet.insertRule(
            `${rule} { display: none !important; }`,
            rules.length
        );

        gradientCount++;
    };

    candidates.forEach((el) => {
        if (!el.isConnected)
            return;

        // Check normal element background.
        const style = getComputedStyle(el);
        const bg = style.backgroundImage || '';

        if (/gradient/i.test(bg)) {
            const rect = el.getBoundingClientRect();

            const isOverlayPositioned =
                style.position === 'absolute' ||
                style.position === 'fixed';

            const isThinBand =
                rect.height > 0 &&
                rect.height < window.innerHeight * 0.6;

            const hasLittleText =
                (el.innerText || '').trim().length < 40;

            if (isOverlayPositioned && isThinBand && hasLittleText) {
                el.remove();
                gradientCount++;
                return;
            }
        }

        // Check actual CSS pseudo-elements.
        checkPseudo(el, '::before');
        checkPseudo(el, '::after');
    });

    return gradientCount;
  }

  function runPass() {
    removedCount = 0;
    unlockedCount = 0;
    gradientCount = 0;

    removeExplicitPaywallElements();
    removeSuspiciousOverlays();
    removeFadeGradients();
    unlockScrolling();

    log(
      `pass complete — removed ${removedCount} element(s), ` +
        `unlocked ${unlockedCount} scroll container(s), ` +
        `stripped ${gradientCount} fade gradient(s)`
    );

    return { removedCount, unlockedCount, gradientCount };
  }

  // Expose a re-run hook for the "already active" branch above.
  window.__naywallRun = runPass;

  const firstPassResult = runPass();

  // Paywalls frequently re-inject their DOM after an XHR/analytics call
  // resolves (e.g. a metering check). Keep watching for a short window
  // after activation so a second wave doesn't sneak back in, then stop
  // to avoid burning CPU on a page you've already fixed.
  const observer = new MutationObserver(() => {
    runPass();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  setTimeout(() => {
    observer.disconnect();
    log('stopped watching for DOM changes after 15s');
  }, 15000);

  // Send a summary back to the popup if it's still open.
  try {
    browser.runtime.sendMessage({
      type: 'naywall-result',
      ...firstPassResult,
    });
  } catch (e) {
    // Popup already closed — fine, the console log above still has it.
  }
})();

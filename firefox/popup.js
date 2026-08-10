const btn = document.getElementById('run-btn');
const statusEl = document.getElementById('status');

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = `status ${kind || ''}`;
}

// Pick up the summary the content script posts back after it runs.
browser.runtime.onMessage.addListener((message) => {
  if (message?.type === 'naywall-result') {
    const parts = [];
    if (message.removedCount) parts.push(`removed ${message.removedCount} element(s)`);
    if (message.unlockedCount) parts.push(`unlocked ${message.unlockedCount} scroll area(s)`);
    if (message.gradientCount) parts.push(`stripped ${message.gradientCount} fade gradient(s)`);

    setStatus(
      parts.length ? `Done — ${parts.join(', ')}.` : 'Done — nothing to clean up here.',
      'success'
    );
    btn.disabled = false;
  }
});

btn.addEventListener('click', async () => {
  btn.disabled = true;
  setStatus('Cleaning…');

  try {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active tab found');
    }

    await browser.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js'],
    });

    // Fallback in case the runtime message doesn't arrive (e.g. popup
    // regained focus slightly late) — re-enable the button regardless.
    setTimeout(() => {
      btn.disabled = false;
    }, 2000);
  } catch (err) {
    console.error(err);
    setStatus(
      "Couldn't run on this page (some pages, like about: or addons.mozilla.org, block extensions).",
      'error'
    );
    btn.disabled = false;
  }
});

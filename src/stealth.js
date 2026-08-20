/**
 * stealth.js — Client-side fingerprint masking & anti-bot evasion scripts.
 * Injected into every frame on document creation via CDP `Page.addScriptToEvaluateOnNewDocument`.
 */

const STEALTH_SCRIPT = `
(() => {
  // 1. Mask navigator.webdriver
  Object.defineProperty(navigator, 'webdriver', {
    get: () => undefined,
    configurable: true
  });

  // 2. Mock chrome runtime object
  if (!window.chrome) {
    window.chrome = {
      app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
      runtime: { OnInstalledReason: {}, OnRestartRequiredReason: {}, PlatformArch: {}, PlatformNaclArch: {}, PlatformOs: {}, RequestUpdateCheckStatus: {} },
      csi: () => {},
      loadTimes: () => {}
    };
  }

  // 3. Mock standard plugins length
  Object.defineProperty(navigator, 'plugins', {
    get: () => [1, 2, 3, 4, 5],
    configurable: true
  });

  // 4. Mock languages
  Object.defineProperty(navigator, 'languages', {
    get: () => ['en-US', 'en'],
    configurable: true
  });

  // 5. Mock permissions API query for notifications
  const originalQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (parameters) => (
    parameters.name === 'notifications' ?
      Promise.resolve({ state: Notification.permission }) :
      originalQuery(parameters)
  );
})();
`;

module.exports = { STEALTH_SCRIPT };

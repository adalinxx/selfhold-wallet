// Selfhold's window, the web wallet (src/web), as this extension knows it:
// the one page that may hand the extension its account, for the person to
// add here. Kept apart from config.ts so the content script stays small.

export const WEB_WALLET_URL = "https://wallet.selfhold.app/";
export const WEB_WALLET_ORIGIN = "https://wallet.selfhold.app";
/** What the window and the extension's content script say to each other on that page, by postMessage. */
export const HANDOFF_CHANNEL = "selfhold-extension";

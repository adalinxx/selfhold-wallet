// Selfhold's window, the web wallet (src/web), and Selfhold for Chrome, as
// each knows the other: the window's page is the one page that may hand the
// extension its account (the manifest's externally_connectable), and it
// hands it only to this extension, by Chrome's own messaging, which no other
// script on the page can read or answer.

export const WEB_WALLET_URL = "https://wallet.selfhold.app/";
export const WEB_WALLET_ORIGIN = "https://wallet.selfhold.app";
/** Selfhold for Chrome, as the Chrome Web Store publishes it. */
export const EXTENSION_ID = "amcobhbipbblfjonmoiicihhfglkhpce";

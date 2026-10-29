# @selfhold/web

Selfhold for a site: let people connect their Selfhold account, approve writes to a Lattice chain, and sign messages. Your site never holds a key.

One wallet object covers both ways people use Selfhold:

- **Selfhold for Chrome**, where it is installed.
- **Selfhold's window** everywhere else, including phones: wallet.selfhold.app opens over your page, as a payment window does. The account is a passkey, so there's nothing to install.

## Install

```sh
npm install @selfhold/web
```

Or load it from Selfhold's own host, with no build step:

```html
<script type="module">
  import { selfhold } from "https://wallet.selfhold.app/v1/selfhold.js";
</script>
```

## Quickstart

```js
import { selfhold } from "@selfhold/web";

const wallet = selfhold();

// From a click: the browser opens Selfhold's window only in answer to one.
connectButton.onclick = async () => {
  const address = await wallet.connect();
  show(`Connected as ${address}`);
};

saveButton.onclick = async () => {
  const sent = await wallet.writeRecords({
    chainPath: ["Nexus", "moniker"],
    actions: [{ key: "profile/bio", newValue: "Hello" }],
  });
  if (!sent) return; // the request resolved to null: nothing to send
  await sent.wait({ onChange: (state) => show(words[state]) });
  show("Saved.");
};

const words = {
  sent: "Sent. Your device's part is done. The network usually records it in about 10 seconds.",
  slow: "Taking longer than usual. It's sent and should still go through.",
  late: "The network hasn't recorded it yet. It may still go through.",
};
```

## The rule that matters: call from a click

`connect`, `writeRecords` and `signMessage` open a window, and browsers open windows only in direct answer to a click. Call them first in your click handler, before you `await` anything else.

If the write needs reading first, pass a promise. The window opens at once and waits for it:

```js
button.onclick = () => wallet.writeRecords(readState().then(buildWrite));
```

Resolving the promise to `null` closes the window and sends nothing.

## API

### `selfhold(options?)`

| Option | Default | |
| --- | --- | --- |
| `use` | `"auto"` | `"auto"`: Selfhold for Chrome where installed, else the window. Or `"window"`, `"extension"`. |
| `hosts` | the hosts Nexus lists for the chain | `() => string[]`, the hosts a write is sent to and read from. |
| `sponsor` | none | `() => string`, a fee sponsor's URL. With one, Selfhold's window pays network fees with a few seconds of work on the person's device, so they need no coins. |
| `wallet` | `https://wallet.selfhold.app/` | The window's page; tests point it at a local copy. |

### `wallet.kind`

`"extension"` or `"window"`: which one is in use right now. Selfhold for Chrome can reach a page after your script runs, so read it when you need it.

### `wallet.connect()` → address

Asks the person to connect. Call it from a click.

### `wallet.address()` → address or `null`

The address this site was given. It never asks the person.

### `wallet.disconnect()`

Forgets the address here.

### `wallet.writeRecords(request, { account?, progress? })` → `Sent` or `null`

Writes records on one chain, and pays addresses from the account in the same transaction, once the person approves.

- `request`: `{ chainPath, actions: [{ key, oldValue?, newValue? }], payments?: [{ to, amount }], fee? }`, or a promise of one.
- `account`: the address you built the write for. If the wallet uses another account now, nothing is sent, and it fails with `AccountChanged`.
- `progress(text)`: what Selfhold's window is doing, such as paying the fee with this device's work.

### `Sent`

- `transactionCID`, `account`, `chainPath`, and `nonce` and `host` where the wallet gives them.
- `wait({ onChange?, check?, signal? })` resolves once the write lands.
  - States, in order: `"sent"`, `"slow"` after 30 seconds, `"late"` after 5 minutes.
  - It rejects with `NotRecorded` after 30 minutes.
  - By default the write has landed once the account's nonce passes it, read from the host the write went to and your `hosts`. That can't tell this write from another the same account signed at the same nonce elsewhere, so where that matters, pass a `check`.
  - Pass `check: async () => true | false | "why"` to decide from your own state instead. Return a string when another write landed in its place: after three reads that agree, `wait` rejects with `Lost` and that string.
- `checkNow()` checks at once. Use it for a "Check again" button on a late write.

### `wallet.signMessage({ text })` → `{ publicKey, signature }`

Signs `"lattice-message:" + your origin + "\n" + text`, once the person approves.

## Errors

Every failure is a `SelfholdError` with a `code`, and a `message` you can show the person as it is.

| `code` | What happened |
| --- | --- |
| `PopupBlocked` | The browser blocked the window: the call wasn't made from a click, or pop-ups are off for your site. |
| `Closed` | The person closed the window. Nothing was signed. |
| `Declined` | The person declined. |
| `Reloaded` | The window was reloaded mid-call. Nothing was signed. |
| `AccountChanged` | The wallet uses another account now. Connect again. |
| `NotConnected` | No account was given to this site. Connect first. |
| `NeedsCoins` | The account can't pay. The error is a `NeedsCoins` with `address`, `needed`, `balance`, and `sponsor` (why the sponsor couldn't pay: `"dear"`, `"down"` or `"most"`). |
| `NoWallet` | `use: "extension"`, and Selfhold for Chrome isn't installed. |
| `Lost` | Sent, but another write landed in its place. |
| `NotRecorded` | Sent, and still not recorded after 30 minutes. |
| `Failed` | Anything else. The message says what. |

## Checklist

- Serve your page over https. While you develop, `http://localhost` and `http://127.0.0.1` work too: Selfhold's window shows them as "a site on this computer".
- Don't send `Cross-Origin-Opener-Policy: same-origin`: it cuts your page off from the window. `same-origin-allow-popups` is fine.
- On iPhone, Selfhold's window opens as a tab. People come back to your tab when it's done.

## License

The full guide: https://selfhold.app/developers.html

MIT. Source: https://github.com/adalinxx/selfhold-wallet/tree/main/packages/web

// Tawk.to live-chat integration. Loaded lazily (only when a user asks for a
// human) so most sessions never pull in Tawk's script or set its cookies. The
// default launcher is hidden; the chat is opened from inside our own assistant.

type TawkApi = {
  maximize?: () => void;
  hideWidget?: () => void;
  showWidget?: () => void;
  onLoad?: () => void;
};

declare global {
  interface Window {
    Tawk_API?: TawkApi;
    Tawk_LoadStart?: Date;
  }
}

const TAWK_SRC = 'https://embed.tawk.to/6a1e9b85d0b6e01c2e34b46c/1jq3ov0cr';

// Support hours, Europe/Istanbul. Live chat is available in this window; outside
// it the assistant forwards the message to the Contact inbox instead.
export const SUPPORT_OPEN_HOUR = 8;
export const SUPPORT_CLOSE_HOUR = 22;

let injected = false;

/** Current hour (0-23) in Europe/Istanbul, independent of the user's timezone. */
export function istanbulHour(): number {
  const part = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Istanbul',
    hour: 'numeric',
    hour12: false,
  })
    .formatToParts(new Date())
    .find((p) => p.type === 'hour');
  const n = parseInt(part?.value ?? '0', 10);
  return Number.isFinite(n) ? n % 24 : 0;
}

export function isSupportOnline(): boolean {
  const h = istanbulHour();
  return h >= SUPPORT_OPEN_HOUR && h < SUPPORT_CLOSE_HOUR;
}

/** Inject the Tawk script once (launcher hidden) and resolve when it's ready. */
export function loadTawk(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    if (window.Tawk_API?.maximize) {
      resolve();
      return;
    }

    window.Tawk_API = window.Tawk_API ?? {};
    const prev = window.Tawk_API.onLoad;
    window.Tawk_API.onLoad = () => {
      try {
        window.Tawk_API?.hideWidget?.();
      } catch {
        /* noop */
      }
      prev?.();
      resolve();
    };

    if (injected) return;
    injected = true;
    window.Tawk_LoadStart = new Date();
    const s = document.createElement('script');
    s.async = true;
    s.src = TAWK_SRC;
    s.charset = 'UTF-8';
    s.setAttribute('crossorigin', '*');
    document.head.appendChild(s);
  });
}

/** Open the live-chat panel (launcher stays hidden). */
export function openTawk(): void {
  try {
    window.Tawk_API?.maximize?.();
  } catch {
    /* noop */
  }
}

// cTrader (Spotware) Open API OAuth. Read-only: we request the 'accounts' scope
// (view access only) and never place trades, matching our investor-style ethos.
// Tokens are exchanged here over HTTPS; the actual account list + deal history is
// read later over the Protobuf socket (a separate module). One OAuth grant covers
// all of a user's cTrader accounts, so the token is stored once per user.

const AUTH_URL = 'https://id.ctrader.com/my/settings/openapi/grantingaccess/';
const TOKEN_URL = 'https://openapi.ctrader.com/apps/token';
const SCOPE = 'accounts';

// Must EXACTLY match a redirect URI registered on the Spotware application.
export const CTRADER_REDIRECT_URI =
  process.env.CTRADER_REDIRECT_URI ??
  'https://tradershindsight.com/api/integrations/ctrader/callback';

function clientId(): string {
  const v = process.env.CTRADER_CLIENT_ID;
  if (!v) throw new Error('CTRADER_CLIENT_ID is not configured');
  return v;
}
function clientSecret(): string {
  const v = process.env.CTRADER_CLIENT_SECRET;
  if (!v) throw new Error('CTRADER_CLIENT_SECRET is not configured');
  return v;
}

export function isCtraderConfigured(): boolean {
  return Boolean(
    process.env.CTRADER_CLIENT_ID && process.env.CTRADER_CLIENT_SECRET,
  );
}

/** The Spotware consent URL the user is sent to. `state` is our CSRF token. */
export function buildCtraderAuthUrl(state: string): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set('client_id', clientId());
  u.searchParams.set('redirect_uri', CTRADER_REDIRECT_URI);
  u.searchParams.set('scope', SCOPE);
  u.searchParams.set('state', state);
  u.searchParams.set('product', 'web');
  return u.toString();
}

export type CtraderTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSec: number;
};

async function tokenRequest(
  params: Record<string, string>,
): Promise<CtraderTokens> {
  const u = new URL(TOKEN_URL);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const res = await fetch(u.toString(), { method: 'GET', cache: 'no-store' });
  const body = (await res.json().catch(() => ({}))) as {
    accessToken?: string;
    refreshToken?: string;
    expiresIn?: number;
    errorCode?: string | null;
    description?: string | null;
  };
  if (!res.ok || body.errorCode || !body.accessToken || !body.refreshToken) {
    throw new Error(
      body.description ||
        body.errorCode ||
        `cTrader token request failed (${res.status})`,
    );
  }
  return {
    accessToken: body.accessToken,
    refreshToken: body.refreshToken,
    expiresInSec:
      typeof body.expiresIn === 'number' ? body.expiresIn : 2_628_000,
  };
}

/** Exchange the authorization code from the redirect for tokens. */
export function exchangeCtraderCode(code: string): Promise<CtraderTokens> {
  return tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: CTRADER_REDIRECT_URI,
    client_id: clientId(),
    client_secret: clientSecret(),
  });
}

/** Refresh an access token (refresh tokens do not expire). */
export function refreshCtraderToken(refreshToken: string): Promise<CtraderTokens> {
  return tokenRequest({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
  });
}

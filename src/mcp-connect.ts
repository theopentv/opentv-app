/**
 * Claude & ChatGPT — the three calls behind `ai-connect.tsx`, and the small
 * arithmetic the screen shows.
 *
 * WHAT THE SERVER HANDS OUT IS A CODE, NOT ACCESS. Claude or ChatGPT opens a
 * page on our server when somebody adds the connector; that page asks for the
 * six digits this phone fetched with its own session. So the phone never holds
 * anything a chatbot could use, and the code is useless a few minutes later.
 *
 * WHAT THEY READ IS THE OPENTV BACKUP, which is why the screen insists on it.
 * The server has no watch-history table and is not getting one for this: the
 * connector reads the same ZIP the phone already uploads, so a user who never
 * turned backup on has nothing for it to read (`no_backup`).
 */
import { api, ApiError } from '@/api';
import { getToken } from '@/community-session';
import { isCustomServer, serverUrl } from '@/server-url';

export type McpCode = { code: string; expiresAt: string };
export type McpConnection = { id: string; client: string; createdAt: string };

/** The address somebody pastes into Claude or ChatGPT. */
/**
 * SHORT ENOUGH TO TYPE. OpenTV's own server answers the connector at
 * theopentv.com/mcp (the site routes only that path and its OAuth to the
 * Worker), because people type this into Claude or ChatGPT by hand. A
 * self-hosted server is reached at its own address.
 */
export function mcpConnectorUrl(): string {
  return isCustomServer() ? `${serverUrl()}/mcp` : 'https://theopentv.com/mcp';
}

/** No token is the same failure the server would give, said without asking it. */
async function token(): Promise<string> {
  const tok = await getToken();
  if (!tok) throw new ApiError('unauthenticated', 401, 'no session');
  return tok;
}

export async function requestMcpCode(): Promise<McpCode> {
  return api<McpCode>('/v1/mcp/code', { method: 'POST', token: await token() });
}

export async function fetchMcpConnections(): Promise<McpConnection[]> {
  const r = await api<{ connections: McpConnection[] }>('/v1/mcp/connections', { token: await token() });
  return r.connections ?? [];
}

export async function removeMcpConnection(id: string): Promise<void> {
  await api(`/v1/mcp/connections/${encodeURIComponent(id)}`, { method: 'DELETE', token: await token() });
}

/**
 * The sentence for a failed "Get a code", or null for "use the shared one".
 *
 * Only the codes this screen has better words for; everything else falls to
 * `communityErrorText`, so there is still exactly one default.
 */
export function mcpErrorKey(
  code: string,
): 'aiConnect.errPlus' | 'aiConnect.errNoBackup' | 'aiConnect.errNotConfigured' | 'community.error.network' | null {
  switch (code) {
    case 'plus_required':
      return 'aiConnect.errPlus';
    case 'no_backup':
      return 'aiConnect.errNoBackup';
    // A self-hosted server without the connector: not an outage, a fact.
    case 'not_configured':
      return 'aiConnect.errNotConfigured';
    case 'network':
      return 'community.error.network';
    default:
      return null;
  }
}

/** "482917" → "482 917": two halves are read and typed, six digits are counted. */
export function groupCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)} ${code.slice(3)}` : code;
}

/** Whole seconds until `expiresAt`, never below zero; 0 for a date that will not parse. */
export function secondsLeft(expiresAt: string, now: number): number {
  const at = Date.parse(expiresAt);
  return Number.isFinite(at) ? Math.max(0, Math.ceil((at - now) / 1000)) : 0;
}

/** 125 → "2:05". */
export function formatCountdown(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

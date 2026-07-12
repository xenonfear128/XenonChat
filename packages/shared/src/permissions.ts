import { ALLOWED_CHAT_MESSAGE_TYPES, type AllowedChatMessageType, type GroupRole } from './constants';

export type GroupAction =
  | 'send_message'
  | 'view'
  | 'leave'
  | 'kick_member'
  | 'set_admin'
  | 'revoke_admin'
  | 'transfer_owner'
  | 'dissolve'
  | 'update_settings'
  | 'manage_announcement'
  | 'pin_announcement'
  | 'invite'
  | 'view_audit';

const OWNER_ACTIONS: GroupAction[] = [
  'send_message',
  'view',
  'kick_member',
  'set_admin',
  'revoke_admin',
  'transfer_owner',
  'dissolve',
  'update_settings',
  'manage_announcement',
  'pin_announcement',
  'invite',
  'view_audit',
];

const ADMIN_ACTIONS: GroupAction[] = [
  'send_message',
  'view',
  'kick_member',
  'update_settings',
  'manage_announcement',
  'pin_announcement',
  'invite',
  'view_audit',
  'leave',
];

const MEMBER_ACTIONS: GroupAction[] = ['send_message', 'view', 'leave'];

export function canGroupAction(role: GroupRole, action: GroupAction): boolean {
  if (role === 'owner') return OWNER_ACTIONS.includes(action);
  if (role === 'admin') return ADMIN_ACTIONS.includes(action);
  return MEMBER_ACTIONS.includes(action);
}

/** Admin cannot kick owner or other admins; only owner can revoke admins. */
export function canKickMember(
  actorRole: GroupRole,
  targetRole: GroupRole,
): { allowed: boolean; reason?: string } {
  if (actorRole === 'member') return { allowed: false, reason: 'PERMISSION_DENIED' };
  if (targetRole === 'owner') return { allowed: false, reason: 'CANNOT_KICK_OWNER' };
  if (actorRole === 'admin' && targetRole === 'admin') {
    return { allowed: false, reason: 'CANNOT_KICK_ADMIN' };
  }
  if (actorRole === 'admin' || actorRole === 'owner') return { allowed: true };
  return { allowed: false, reason: 'PERMISSION_DENIED' };
}

export function isMessageTypeAllowed(
  allowed: AllowedChatMessageType[],
  type: string,
): boolean {
  return (ALLOWED_CHAT_MESSAGE_TYPES as readonly string[]).includes(type) &&
    allowed.includes(type as AllowedChatMessageType);
}

export function computeExpiresAt(
  createdAt: Date,
  ttlSeconds: number | null | undefined,
): Date | null {
  if (!ttlSeconds || ttlSeconds <= 0) return null;
  return new Date(createdAt.getTime() + ttlSeconds * 1000);
}

export function isPrivateIp(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '0.0.0.0' || lower.endsWith('.local')) return true;
  if (lower === 'metadata.google.internal') return true;

  const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  if (hostname.includes(':')) {
    const h = hostname.toLowerCase();
    if (h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  }
  return false;
}

export function isSafePreviewUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    if (isPrivateIp(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

export function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>"')\]]+/gi;
  const urls = (text.match(re) ?? []).map((u) => u.replace(/[.,;:!?)]+$/, ''));
  return Array.from(new Set(urls));
}

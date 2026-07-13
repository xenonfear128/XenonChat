import type { ApiResponse, AuthTokens, PublicUser } from '@/types';

const API_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_URL) ||
  'http://localhost:4000';

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(message: string, code = 'INTERNAL_ERROR', status = 500, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

type TokenGetter = () => { accessToken: string | null; refreshToken: string | null };
type TokenSetter = (access: string, refresh: string) => void;
type LogoutFn = () => void;

let getTokens: TokenGetter = () => ({ accessToken: null, refreshToken: null });
let setTokens: TokenSetter = () => undefined;
let onLogout: LogoutFn = () => undefined;
let refreshPromise: Promise<string | null> | null = null;

export function configureApiAuth(opts: {
  getTokens: TokenGetter;
  setTokens: TokenSetter;
  onLogout: LogoutFn;
}) {
  getTokens = opts.getTokens;
  setTokens = opts.setTokens;
  onLogout = opts.onLogout;
}

function apiUrl(path: string) {
  const base = API_BASE.replace(/\/$/, '');
  const p = path.startsWith('/') ? path : `/${path}`;
  if (base.endsWith('/api')) return `${base}${p}`;
  return `${base}/api${p}`;
}

async function parseJson<T>(res: Response): Promise<ApiResponse<T>> {
  const text = await res.text();
  if (!text) return { ok: res.ok } as ApiResponse<T>;
  try {
    return JSON.parse(text) as ApiResponse<T>;
  } catch {
    throw new ApiError('Invalid JSON response', 'INTERNAL_ERROR', res.status);
  }
}

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const { refreshToken } = getTokens();
    if (!refreshToken) return null;
    try {
      const res = await fetch(apiUrl('/auth/refresh'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      const json = await parseJson<AuthTokens>(res);
      if (!res.ok || !json.ok || !json.data) {
        onLogout();
        return null;
      }
      setTokens(json.data.access_token, json.data.refresh_token);
      return json.data.access_token;
    } catch {
      onLogout();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}

export type RequestOptions = {
  method?: string;
  body?: unknown;
  auth?: boolean;
  headers?: Record<string, string>;
  formData?: FormData;
  signal?: AbortSignal;
};

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, headers = {}, formData, signal } = options;
  const h: Record<string, string> = { ...headers };

  if (auth) {
    let { accessToken } = getTokens();
    if (!accessToken) {
      accessToken = await refreshAccessToken();
    }
    if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      headers: formData ? h : { 'Content-Type': 'application/json', ...h },
      body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });
  } catch {
    throw new ApiError('Network error', 'NETWORK_ERROR', 0);
  }

  if (res.status === 401 && auth) {
    const next = await refreshAccessToken();
    if (next) {
      h.Authorization = `Bearer ${next}`;
      res = await fetch(apiUrl(path), {
        method,
        headers: formData ? h : { 'Content-Type': 'application/json', ...h },
        body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
        signal,
      });
    } else {
      throw new ApiError('Unauthorized', 'UNAUTHORIZED', 401);
    }
  }

  const json = await parseJson<T>(res);
  if (!res.ok || json.ok === false) {
    throw new ApiError(
      json.error?.message || 'Request failed',
      json.error?.code || 'INTERNAL_ERROR',
      res.status,
      json.error?.details,
    );
  }
  return json.data as T;
}

export const api = {
  register: (body: {
    email: string;
    password: string;
    username: string;
    nickname: string;
  }) => apiRequest<AuthTokens>('/auth/register', { method: 'POST', body, auth: false }),

  login: (body: { identifier: string; password: string; device_name?: string }) =>
    apiRequest<AuthTokens>('/auth/login', { method: 'POST', body, auth: false }),

  logout: () => apiRequest<{ success: boolean }>('/auth/logout', { method: 'POST' }),

  requestPasswordReset: (email: string) =>
    apiRequest<{
      success: boolean;
      reset_token?: string;
      delivery?: 'email' | 'development';
    }>('/auth/reset-password/request', {
      method: 'POST',
      body: { email },
      auth: false,
    }),

  confirmPasswordReset: (body: { token: string; new_password: string }) =>
    apiRequest<{ success: boolean }>('/auth/reset-password/confirm', {
      method: 'POST',
      body,
      auth: false,
    }),

  changePassword: (body: { current_password: string; new_password: string }) =>
    apiRequest<{ success: boolean }>('/auth/change-password', { method: 'POST', body }),

  devices: () => apiRequest<import('@/types').Device[]>('/auth/devices'),

  revokeDevice: (deviceId: string) =>
    apiRequest<{ success: boolean }>(`/auth/devices/${deviceId}`, { method: 'DELETE' }),

  me: () => apiRequest<PublicUser & { privacy?: import('@/types').PrivacySettings }>('/users/me'),

  updateMe: (body: Record<string, unknown>) =>
    apiRequest<PublicUser>('/users/me', { method: 'PATCH', body }),

  updatePrivacy: (body: Partial<import('@/types').PrivacySettings>) =>
    apiRequest<import('@/types').PrivacySettings>('/users/me/privacy', {
      method: 'PATCH',
      body,
    }),

  searchUsers: (q: string) =>
    apiRequest<PublicUser[]>(`/users/search?q=${encodeURIComponent(q)}`),

  getUser: (userId: string) => apiRequest<PublicUser>(`/users/${userId}`),

  conversations: () =>
    apiRequest<import('@/types').ConversationSummary[]>('/conversations'),

  getConversation: (id: string) =>
    apiRequest<import('@/types').ConversationSummary>(`/conversations/${id}`),

  createDirect: (user_id: string) =>
    apiRequest<import('@/types').ConversationSummary>('/conversations/direct', {
      method: 'POST',
      body: { user_id },
    }),

  pinConversation: (id: string, pinned: boolean) =>
    apiRequest(`/conversations/${id}/pin`, { method: pinned ? 'POST' : 'DELETE' }),

  muteConversation: (id: string, muted: boolean) =>
    apiRequest(`/conversations/${id}/mute`, { method: muted ? 'POST' : 'DELETE' }),

  markRead: (id: string, message_id?: string) =>
    apiRequest(`/conversations/${id}/read`, {
      method: 'POST',
      body: { message_id },
    }),

  messages: (conversationId: string, params?: { before?: string; after?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.before) q.set('before', params.before);
    if (params?.after) q.set('after', params.after);
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return apiRequest<import('@/types').ChatMessage[]>(
      `/conversations/${conversationId}/messages${qs ? `?${qs}` : ''}`,
    );
  },

  sendMessage: (body: Record<string, unknown>) =>
    apiRequest<import('@/types').ChatMessage>('/messages', { method: 'POST', body }),

  revokeMessage: (id: string) =>
    apiRequest(`/messages/${id}/revoke`, { method: 'POST' }),

  deleteMessage: (id: string) =>
    apiRequest(`/messages/${id}`, { method: 'DELETE' }),

  reportMessage: (id: string, reason: string) =>
    apiRequest(`/messages/${id}/report`, { method: 'POST', body: { reason } }),

  contacts: () => apiRequest<import('@/types').Contact[]>('/contacts'),

  friendRequests: () => apiRequest<import('@/types').FriendRequest[]>('/contacts/requests'),

  sendFriendRequest: (body: { to_user_id: string; message?: string }) =>
    apiRequest('/contacts/requests', { method: 'POST', body }),

  acceptFriendRequest: (id: string) =>
    apiRequest(`/contacts/requests/${id}/accept`, { method: 'POST' }),

  rejectFriendRequest: (id: string) =>
    apiRequest(`/contacts/requests/${id}/reject`, { method: 'POST' }),

  removeContact: (userId: string) =>
    apiRequest(`/contacts/${userId}`, { method: 'DELETE' }),

  updateRemark: (userId: string, remark?: string) =>
    apiRequest(`/contacts/${userId}`, { method: 'PATCH', body: { remark } }),

  blocks: () => apiRequest<import('@/types').BlockedUser[]>('/blocks'),

  blockUser: (userId: string, reason?: string) =>
    apiRequest(`/blocks/${userId}`, { method: 'POST', body: { reason } }),

  unblockUser: (userId: string) =>
    apiRequest(`/blocks/${userId}`, { method: 'DELETE' }),

  momentsFeed: (cursor?: string) => {
    const q = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
    return apiRequest<import('@/types').MomentPost[]>(`/moments/feed${q}`);
  },

  createMoment: (body: Record<string, unknown>) =>
    apiRequest<import('@/types').MomentPost>('/moments/posts', { method: 'POST', body }),

  deleteMoment: (id: string) =>
    apiRequest(`/moments/posts/${id}`, { method: 'DELETE' }),

  commentMoment: (id: string, body: string) =>
    apiRequest(`/moments/posts/${id}/comments`, { method: 'POST', body: { body } }),

  reactMoment: (id: string, reaction = 'like') =>
    apiRequest(`/moments/posts/${id}/reactions`, { method: 'POST', body: { reaction } }),

  unreactMoment: (id: string, reaction = 'like') =>
    apiRequest(`/moments/posts/${id}/reactions/${reaction}`, { method: 'DELETE' }),

  createGroup: (body: {
    public_id: string;
    name: string;
    description?: string;
    member_ids?: string[];
  }) => apiRequest('/groups', { method: 'POST', body }),

  linkPreview: (url: string) =>
    apiRequest<import('@/types').LinkPreview>('/link-preview', {
      method: 'POST',
      body: { url },
    }),

  uploadMedia: async (file: File, kind?: string) => {
    const fd = new FormData();
    fd.append('file', file, file.name);
    if (kind) fd.append('kind', kind);
    return apiRequest<{
      id: string;
      url?: string;
      mime_type: string;
      size_bytes: number;
      original_name?: string;
    }>('/media/upload', { method: 'POST', formData: fd });
  },
};

export { apiUrl };

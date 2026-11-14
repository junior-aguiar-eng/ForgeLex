import { WEBHOOK_EVENT_TYPES } from './webhooks.js';

/** A subscription authorizes an ongoing feed, so every selected family needs read authority. */
export function canSubscribeWebhook(scopes: readonly string[], events: unknown): boolean {
  if (!Array.isArray(events) || events.length === 0) return false;
  return events.every((event: unknown) => {
    if (typeof event !== 'string') return false;
    if (!(WEBHOOK_EVENT_TYPES as readonly string[]).includes(event)) return false;
    const required = event.startsWith('billing.')
      ? 'billing:read'
      : event.startsWith('research.')
        ? 'research:read'
        : event.startsWith('draft.')
          ? 'draft:write'
          : 'matter:read';
    return scopes.includes(required);
  });
}

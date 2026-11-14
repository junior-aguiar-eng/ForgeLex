import { WEBHOOK_EVENT_TYPES, type WebhookEventType } from './webhooks.js';

/** True when `events` is a non-empty list made only of known webhook event types. */
export function isValidWebhookEventTypes(events: unknown): events is WebhookEventType[] {
  return (
    Array.isArray(events) &&
    events.length > 0 &&
    events.every(
      (event: unknown) => typeof event === 'string' && (WEBHOOK_EVENT_TYPES as readonly string[]).includes(event),
    )
  );
}

/**
 * A subscription authorizes an ongoing feed, so every selected family needs the authority that reads it. Drafts use
 * `draft:write` because no read-only draft scope exists; every other family is gated by its own read scope.
 */
export function missingWebhookScopes(scopes: readonly string[], events: readonly WebhookEventType[]): string[] {
  const required = new Set(
    events.map((event) =>
      event.startsWith('billing.')
        ? 'billing:read'
        : event.startsWith('research.')
          ? 'research:read'
          : event.startsWith('draft.')
            ? 'draft:write'
            : 'matter:read',
    ),
  );
  return [...required].filter((scope) => !scopes.includes(scope));
}

/** Valid event list and every required scope present. Invalid input is never authorized. */
export function canSubscribeWebhook(scopes: readonly string[], events: unknown): boolean {
  return isValidWebhookEventTypes(events) && missingWebhookScopes(scopes, events).length === 0;
}

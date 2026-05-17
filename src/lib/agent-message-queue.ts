/**
 * In-memory message queue for sending operator messages into a running
 * research agent loop. The agent route drains this queue at every iteration
 * boundary (before each anthropic.messages.create call) and folds the messages
 * into the next user turn.
 *
 * Why in-memory: the only producer is one POST endpoint and the only consumer
 * is the SSE stream from the same campaign run, both running in the same
 * Node process. If the deployment ever scales to multiple instances, swap this
 * for a DB-backed queue (the prospect_chat_messages table from migration 033
 * is already shaped for it).
 */

const queues = new Map<string, string[]>();

export function enqueueMessage(campaignId: string, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  const existing = queues.get(campaignId) ?? [];
  existing.push(trimmed);
  queues.set(campaignId, existing);
}

export function drainMessages(campaignId: string): string[] {
  const messages = queues.get(campaignId);
  if (!messages || messages.length === 0) return [];
  queues.delete(campaignId);
  return messages;
}

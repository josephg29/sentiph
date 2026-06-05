import type { ChannelMessage } from "@sentiph/core";

export type EnqueueChannelMessageInput = {
  fromTerminalId: string;
  toTerminalId: string;
  content: string;
};

export type ChannelStoreOptions = {
  /** Injectable id generator (tests pass a deterministic one). */
  generateMessageId?: () => string;
  /** Injectable clock (tests pass a fixed one). */
  now?: () => Date;
};

export type ChannelStore = {
  enqueue: (input: EnqueueChannelMessageInput) => ChannelMessage;
  /** All messages (queued + delivered) for a terminal, as a copy. */
  list: (terminalId: string) => ChannelMessage[];
  /** Undelivered messages for a terminal, in arrival order. */
  takePending: (terminalId: string) => ChannelMessage[];
  markDelivered: (terminalId: string, messageId: string) => void;
  hasPending: (terminalId: string) => boolean;
};

/**
 * In-memory, per-terminal message queue backing the channel feature.
 * Messages are never persisted — they live only for the current API process,
 * matching the documented "in-memory channel" semantics.
 */
export const createChannelStore = (options: ChannelStoreOptions = {}): ChannelStore => {
  const queues = new Map<string, ChannelMessage[]>();
  let counter = 0;
  const generateMessageId =
    options.generateMessageId ??
    (() => `msg-${Date.now().toString(36)}-${(counter++).toString(36)}`);
  const now = options.now ?? (() => new Date());

  const enqueue = ({ fromTerminalId, toTerminalId, content }: EnqueueChannelMessageInput) => {
    const message: ChannelMessage = {
      messageId: generateMessageId(),
      fromTerminalId,
      toTerminalId,
      content,
      timestamp: now().toISOString(),
      delivered: false,
    };
    const queue = queues.get(toTerminalId);
    if (queue) {
      queue.push(message);
    } else {
      queues.set(toTerminalId, [message]);
    }
    return message;
  };

  const list = (terminalId: string): ChannelMessage[] => {
    const queue = queues.get(terminalId);
    return queue ? queue.map((message) => ({ ...message })) : [];
  };

  const takePending = (terminalId: string): ChannelMessage[] =>
    (queues.get(terminalId) ?? []).filter((message) => !message.delivered);

  const markDelivered = (terminalId: string, messageId: string) => {
    for (const message of queues.get(terminalId) ?? []) {
      if (message.messageId === messageId) {
        message.delivered = true;
        return;
      }
    }
  };

  const hasPending = (terminalId: string): boolean =>
    (queues.get(terminalId) ?? []).some((message) => !message.delivered);

  return { enqueue, list, takePending, markDelivered, hasPending };
};

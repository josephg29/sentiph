export type ChannelMessage = {
  messageId: string;
  fromTerminalId: string;
  toTerminalId: string;
  content: string;
  timestamp: string;
  delivered: boolean;
};

/**
 * Renders a channel message as the single line that gets injected into the
 * target terminal's PTY when the message is delivered.
 *
 * The format is stable and documented (see docs/guides/inter-agent-messaging.md):
 *   [Channel message from <from-terminal-id>]: <content>
 */
export const formatChannelDelivery = (
  message: Pick<ChannelMessage, "fromTerminalId" | "content">,
): string => `[Channel message from ${message.fromTerminalId}]: ${message.content}`;

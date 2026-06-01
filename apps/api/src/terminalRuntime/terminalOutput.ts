import type { TerminalSession } from "./types";

const ANSI_BEL = String.fromCharCode(0x07);
const ANSI_ESCAPE = String.fromCharCode(0x1b);
const BROKEN_OSC_TAIL_RE = new RegExp(
  `^\\][^${ANSI_BEL}${ANSI_ESCAPE}]*(?:${ANSI_BEL}|${ANSI_ESCAPE}\\\\)`,
);

export const appendScrollback = (
  session: TerminalSession,
  chunk: string,
  scrollbackMaxBytes: number,
) => {
  let nextChunk = chunk;
  let nextChunkBytes = Buffer.byteLength(nextChunk, "utf8");
  if (nextChunkBytes > scrollbackMaxBytes) {
    const chunkBuffer = Buffer.from(nextChunk, "utf8");
    nextChunk = chunkBuffer.subarray(chunkBuffer.length - scrollbackMaxBytes).toString("utf8");
    nextChunkBytes = Buffer.byteLength(nextChunk, "utf8");
    session.scrollbackChunks = [];
    session.scrollbackBytes = 0;
  }

  session.scrollbackChunks.push(nextChunk);
  session.scrollbackBytes += nextChunkBytes;
  while (session.scrollbackBytes > scrollbackMaxBytes && session.scrollbackChunks.length > 0) {
    const removedChunk = session.scrollbackChunks.shift();
    if (!removedChunk) {
      break;
    }

    session.scrollbackBytes -= Buffer.byteLength(removedChunk, "utf8");
  }
};

export const stripBrokenLeadingAnsi = (text: string): string => {
  let nextText = text;

  while (nextText.length > 0) {
    if (nextText.startsWith("\u001b")) {
      return nextText;
    }

    const oscMatch = nextText.match(BROKEN_OSC_TAIL_RE);
    if (oscMatch) {
      nextText = nextText.slice(oscMatch[0].length);
      continue;
    }

    const csiTailMatch = nextText.match(/^\[[0-9:;<=>?]*[ -/]*[@-~]/);
    if (csiTailMatch) {
      nextText = nextText.slice(csiTailMatch[0].length);
      continue;
    }

    const orphanedCsiTailMatch = nextText.match(/^(?=[0-9:;<=>?]*[;:<=>?])[0-9:;<=>?]*[ -/]*[@-~]/);
    if (orphanedCsiTailMatch) {
      nextText = nextText.slice(orphanedCsiTailMatch[0].length);
      continue;
    }

    break;
  }

  return nextText;
};

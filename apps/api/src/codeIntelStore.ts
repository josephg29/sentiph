import { appendFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const CODE_INTEL_RELATIVE_PATH = ".octogent/state/code-intel-events.jsonl";

export type CodeIntelEvent = {
  ts: string;
  sessionId: string;
  tool: string;
  file: string;
};

export type CodeIntelStore = {
  append: (event: CodeIntelEvent) => Promise<void>;
  readAll: () => Promise<CodeIntelEvent[]>;
};

export const createCodeIntelStore = (workspaceCwd: string): CodeIntelStore => {
  const filePath = join(workspaceCwd, CODE_INTEL_RELATIVE_PATH);

  return {
    async append(event) {
      const dir = join(workspaceCwd, ".octogent/state");
      await mkdir(dir, { recursive: true });
      await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf-8");
    },

    async readAll() {
      let raw: string;
      try {
        raw = await readFile(filePath, "utf-8");
      } catch {
        return [];
      }

      const events: CodeIntelEvent[] = [];
      for (const line of raw.split("\n")) {
        if (line.trim().length === 0) continue;
        try {
          events.push(JSON.parse(line) as CodeIntelEvent);
        } catch {
          // skip malformed lines
        }
      }
      return events;
    },
  };
};

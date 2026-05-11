import { createInterface } from "node:readline";

const apiOrigin = process.env.OCTOGENT_API_ORIGIN ?? "http://127.0.0.1:8787";

const TOOLS = [
  {
    name: "spawn_terminal",
    description:
      "Spawn a new terminal session with an initial prompt. The terminal runs Claude Code and is attached to the Octoboss context. Returns the terminal ID so you can check its output later.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description: "The initial prompt to send to the new terminal",
        },
        name: {
          type: "string",
          description: "Optional short name for the terminal (shown on the canvas)",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "get_terminal_output",
    description:
      "Read the current output of a terminal by its ID. Returns all text the terminal has produced so far. Use this to check if a spawned terminal has finished its task.",
    inputSchema: {
      type: "object",
      properties: {
        terminal_id: {
          type: "string",
          description: "The terminal ID returned by spawn_terminal",
        },
      },
      required: ["terminal_id"],
    },
  },
];

const stripAnsi = (text: string): string =>
  text
    .replace(/\x1b\[[\x20-\x3f]*[\x40-\x7e]/g, "")
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[@-_]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");

const send = (message: unknown): void => {
  process.stdout.write(JSON.stringify(message) + "\n");
};

const handleToolCall = async (
  name: string,
  args: Record<string, unknown>,
): Promise<string> => {
  if (name === "spawn_terminal") {
    const prompt = String(args.prompt ?? "").trim();
    if (!prompt) throw new Error("prompt is required");

    const body: Record<string, unknown> = {
      workspaceMode: "shared",
      tentacleId: "__octoboss__",
      initialPrompt: prompt,
    };
    if (args.name && typeof args.name === "string" && args.name.trim()) {
      body.tentacleName = args.name.trim();
    }

    const res = await fetch(`${apiOrigin}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      throw new Error(String(data.error ?? `API error ${res.status}`));
    }

    const terminalId = String(data.terminalId ?? "");
    return `Spawned terminal "${terminalId}". Use get_terminal_output("${terminalId}") to read its output when ready.`;
  }

  if (name === "get_terminal_output") {
    const terminalId = String(args.terminal_id ?? "").trim();
    if (!terminalId) throw new Error("terminal_id is required");

    const res = await fetch(
      `${apiOrigin}/api/terminals/${encodeURIComponent(terminalId)}/scrollback`,
    );
    if (res.status === 404) {
      return "Terminal not found or has no output yet.";
    }
    if (!res.ok) {
      throw new Error(`API error ${res.status}`);
    }

    const raw = await res.text();
    const clean = stripAnsi(raw).trim();
    return clean || "No output yet.";
  }

  throw new Error(`Unknown tool: ${name}`);
};

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return;
  }

  const { id, method, params } = msg as {
    id?: unknown;
    method?: string;
    params?: unknown;
  };

  if (id === undefined) return;

  const respond = (result: unknown) =>
    send({ jsonrpc: "2.0", id, result });

  const respondError = (code: number, message: string) =>
    send({ jsonrpc: "2.0", id, error: { code, message } });

  if (method === "initialize") {
    respond({
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "octogent", version: "1.0.0" },
    });
    return;
  }

  if (method === "tools/list") {
    respond({ tools: TOOLS });
    return;
  }

  if (method === "tools/call") {
    const { name, arguments: toolArgs } = (params ?? {}) as {
      name?: string;
      arguments?: Record<string, unknown>;
    };
    if (!name) {
      respondError(-32602, "Missing tool name");
      return;
    }

    handleToolCall(name, toolArgs ?? {})
      .then((text) => {
        respond({ content: [{ type: "text", text }] });
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        respond({
          content: [{ type: "text", text: `Error: ${message}` }],
          isError: true,
        });
      });
    return;
  }

  respondError(-32601, "Method not found");
});

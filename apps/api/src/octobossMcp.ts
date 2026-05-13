import { createInterface } from "node:readline";

const apiOrigin = process.env.OCTOGENT_API_ORIGIN ?? "http://127.0.0.1:8787";
const parentTerminalId = process.env.OCTOGENT_SESSION_ID ?? null;
const MAX_PROMPT_LENGTH = 8192;

const TOOLS = [
  {
    name: "list_terminals",
    description:
      "List all terminal sessions that belong to this Octoboss instance, along with their current state. Always call this before spawn_terminal to check whether an idle terminal is already available for the task.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "spawn_terminal",
    description:
      "Spawn a NEW terminal session with an initial prompt. Only use this when list_terminals shows no idle terminals are available. If an idle terminal already exists, use send_prompt instead to reuse it.",
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
    name: "send_prompt",
    description:
      "Send a prompt to an existing idle terminal. Use this instead of spawn_terminal when list_terminals shows a terminal with agentRuntimeState \"idle\".",
    inputSchema: {
      type: "object",
      properties: {
        terminal_id: {
          type: "string",
          description: "The terminal ID to send the prompt to (must be idle)",
        },
        prompt: {
          type: "string",
          description: "The prompt to send to the terminal",
        },
      },
      required: ["terminal_id", "prompt"],
    },
  },
  {
    name: "get_terminal_output",
    description:
      "Read the current output of a terminal by its ID. Returns all text the terminal has produced so far. Use this to check if a terminal has finished its task.",
    inputSchema: {
      type: "object",
      properties: {
        terminal_id: {
          type: "string",
          description: "The terminal ID",
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
  if (name === "list_terminals") {
    const res = await fetch(`${apiOrigin}/api/terminal-snapshots`);
    if (!res.ok) {
      throw new Error(`API error ${res.status}`);
    }
    const snapshots = (await res.json()) as Array<Record<string, unknown>>;

    const children = parentTerminalId
      ? snapshots.filter((s) => s.parentTerminalId === parentTerminalId)
      : snapshots.filter(
          (s) => s.parentTerminalId !== undefined && s.parentTerminalId !== null,
        );

    if (children.length === 0) {
      return "No terminals yet. Use spawn_terminal to create one.";
    }

    const lines = children.map((s) => {
      const agentState = s.agentRuntimeState as string | undefined;
      const lifecycle = s.lifecycleState as string | undefined;
      const displayState = agentState ?? lifecycle ?? String(s.state ?? "unknown");
      const termName = s.tentacleName ?? s.terminalId;
      return `- ${s.terminalId} (${termName}): ${displayState}`;
    });

    const idleCount = children.filter((s) => s.agentRuntimeState === "idle").length;
    const hint =
      idleCount > 0
        ? `\n\n${idleCount} terminal(s) are idle and ready to accept a new prompt via send_prompt.`
        : "\n\nNo idle terminals. Use spawn_terminal to create a new one.";

    return `Terminals:\n${lines.join("\n")}${hint}`;
  }

  if (name === "send_prompt") {
    const terminalId = String(args.terminal_id ?? "").trim();
    const prompt = String(args.prompt ?? "").trim();
    if (!terminalId) throw new Error("terminal_id is required");
    if (!prompt) throw new Error("prompt is required");
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(`prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`);
    }

    const data = prompt.endsWith("\n") ? prompt : `${prompt}\n`;
    const res = await fetch(
      `${apiOrigin}/api/terminals/${encodeURIComponent(terminalId)}/input`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      },
    );

    if (res.status === 404) {
      return `Terminal "${terminalId}" not found or not active. Use list_terminals to see available terminals, or spawn_terminal to create a new one.`;
    }
    if (!res.ok) {
      const errData = (await res.json()) as Record<string, unknown>;
      throw new Error(String(errData.error ?? `API error ${res.status}`));
    }

    return `Sent prompt to terminal "${terminalId}". Use get_terminal_output("${terminalId}") to read its output.`;
  }

  if (name === "spawn_terminal") {
    const prompt = String(args.prompt ?? "").trim();
    if (!prompt) throw new Error("prompt is required");
    if (prompt.length > MAX_PROMPT_LENGTH) {
      throw new Error(
        `prompt exceeds maximum length of ${MAX_PROMPT_LENGTH} characters`,
      );
    }

    const body: Record<string, unknown> = {
      workspaceMode: "shared",
      initialPrompt: prompt,
    };
    if (parentTerminalId) {
      body.parentTerminalId = parentTerminalId;
    }
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

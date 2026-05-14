import { createInterface } from "node:readline";

const apiOrigin = process.env.OCTOGENT_API_ORIGIN ?? "http://127.0.0.1:8787";
const parentTerminalId = process.env.OCTOGENT_SESSION_ID ?? null;
const MAX_PROMPT_LENGTH = 8192;

const TOOLS = [
  {
    name: "list_terminals",
    description:
      "List the child Claude Code agents you are orchestrating, with their current runtime state. Each entry is a full Claude Code session running in its own terminal. State \"idle\" means the agent has finished its previous turn and is ready to accept a new prompt. Always call this before spawn_terminal so you can reuse an idle agent via send_prompt instead of paying the spawn cost.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "spawn_terminal",
    description:
      "Spawn a NEW child Claude Code agent in its own terminal and give it an initial task. The child is a full Claude Code session with the standard toolset: Bash, Read, Write, Edit, Glob, Grep, WebFetch, and more. It can run shell commands, read and write files, hit HTTP endpoints, and operate independently. Phrase the prompt as a natural-language task describing the goal and any constraints, the way you would brief a competent engineer. Do NOT paste raw shell commands as the prompt: the child reads the prompt as conversational input, not as a shell, and will choose its own tools to satisfy the task. Good prompt: Build the project, run the test suite, and report any failures with file and line. Bad prompt: cd repo and run npm test. Use spawn_terminal only when list_terminals shows no idle child you can reuse.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: {
          type: "string",
          description:
            "Natural-language task for the new child agent. Describe the goal, constraints, and what to report back. The child will pick its own tools (Bash, Write, etc.) to do the work.",
        },
        name: {
          type: "string",
          description: "Optional short name for the agent (shown on the canvas).",
        },
      },
      required: ["prompt"],
    },
  },
  {
    name: "send_prompt",
    description:
      "Send a follow-up task to an existing idle child agent (one whose agentRuntimeState is idle). Same prompting rules as spawn_terminal: phrase as a natural-language task, not as raw shell. The child will use its own Bash, Read, Write, Edit, etc. to carry out the work. Prefer send_prompt over spawn_terminal whenever an idle child is available, so context and history are preserved.",
    inputSchema: {
      type: "object",
      properties: {
        terminal_id: {
          type: "string",
          description: "Terminal ID of the idle child agent to send the task to.",
        },
        prompt: {
          type: "string",
          description:
            "Natural-language task for the child agent. The child reads this as a conversational prompt and will pick its own tools to satisfy it.",
        },
      },
      required: ["terminal_id", "prompt"],
    },
  },
  {
    name: "get_terminal_output",
    description:
      "Read the current scrollback of a child agent by its terminal ID. Returns the rendered text the agent has produced so far (assistant messages and tool output). Child agents work asynchronously, so a single read may show work in progress; call again later to check for completion. Cross-reference with list_terminals to see whether the child is still busy or has returned to idle.",
    inputSchema: {
      type: "object",
      properties: {
        terminal_id: {
          type: "string",
          description: "Terminal ID of the child agent whose output you want to read.",
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

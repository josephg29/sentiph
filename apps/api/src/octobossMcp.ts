import { createInterface } from "node:readline";

const apiOrigin = process.env.SENTIPH_API_ORIGIN ?? "http://127.0.0.1:8787";
const parentTerminalId = process.env.SENTIPH_SESSION_ID ?? null;
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
          description:
            "Short, plain-English name shown on the canvas. Reflect what the agent does. Single instance: use the role word ('Parser', 'Tester', 'Builder'). Multiple agents of the same role: add a number ('Parser 1', 'Parser 2'). Use a more specific word when only one agent of that kind exists ('Migrator', 'Deployer', 'Linter', 'Scraper'). Keep it under 20 characters, no jargon.",
        },
        color: {
          type: "string",
          description:
            "Hex color for the agent node on the canvas. Pick based on the agent's primary role:\n- Parser (parsing, extracting, transforming, codegen from spec): #00c8ff\n- Tester (unit, integration, E2E, snapshot, coverage): #39ff14\n- Builder (compile, bundle, deploy, migrate DB, seed, cache-warm, git ops): #ff6b2b\n- Linter (lint, format, type-check, schema validation): #ffee00\n- Fetcher (HTTP requests, scraping, downloading, API calls): #00fff7\n- Analyzer (profiling, debugging, auditing, benchmarking, coordinating sub-agents): #bf5fff\n- Writer (file writing, doc generation, report generation, boilerplate codegen): #ff4df0\n- Watcher (filesystem watching, log tailing, polling, monitoring): #00ffaa\n- Researcher (web research, library docs, knowledge gathering): #ff9500\n- Reviewer (code review, PR review, quality checks): #ff2d6b\nWhen a task spans multiple roles, use the color of the role that describes the agent's primary output.",
        },
      },
      required: ["prompt", "name", "color"],
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
  {
    name: "close_terminal",
    description:
      "Stop a child agent terminal. By default sends SIGTERM for a graceful shutdown; set force=true to send SIGKILL for an immediate hard stop. Use this to clean up idle or stuck agents you no longer need.",
    inputSchema: {
      type: "object",
      properties: {
        terminal_id: {
          type: "string",
          description: "Terminal ID of the child agent to close.",
        },
        force: {
          type: "boolean",
          description:
            "If true, send SIGKILL for an immediate hard stop instead of SIGTERM. Default false.",
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

    const data = `\x1b[200~${prompt}\x1b[201~\r`;
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
    if (args.color && typeof args.color === "string" && /^#[0-9a-fA-F]{6}$/.test(args.color)) {
      body.color = args.color;
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

  if (name === "close_terminal") {
    const terminalId = String(args.terminal_id ?? "").trim();
    if (!terminalId) throw new Error("terminal_id is required");
    const force = args.force === true;
    const action = force ? "kill" : "stop";

    const res = await fetch(
      `${apiOrigin}/api/terminals/${encodeURIComponent(terminalId)}/${action}`,
      { method: "POST" },
    );

    if (res.status === 404) {
      return `Terminal "${terminalId}" not found.`;
    }
    if (!res.ok) {
      const errData = (await res.json()) as Record<string, unknown>;
      throw new Error(String(errData.error ?? `API error ${res.status}`));
    }

    return `Terminal "${terminalId}" ${force ? "killed (SIGKILL)" : "stopped (SIGTERM)"}.`;
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
      serverInfo: { name: "sentiph", version: "1.0.0" },
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

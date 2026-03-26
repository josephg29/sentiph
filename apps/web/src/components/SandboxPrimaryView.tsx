import { useCallback, useEffect, useRef, useState } from "react";

import {
  buildTentacleRenameUrl,
  buildTerminalsUrl,
  buildTerminalSocketUrl,
} from "../runtime/runtimeEndpoints";
import { Terminal } from "./Terminal";
import { ActionButton } from "./ui/ActionButton";

type SandboxAgent = {
  tentacleId: string;
  terminalId: string;
  initialPrompt?: string;
};

const createSandboxTentacleRequest = async (): Promise<SandboxAgent> => {
  const response = await fetch(buildTerminalsUrl(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workspaceMode: "shared",
      agentProvider: "claude-code",
      name: "sandbox",
      promptTemplate: "sandbox-init",
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create sandbox tentacle (${response.status})`);
  }

  const snapshot = (await response.json()) as { tentacleId?: string; initialPrompt?: string };
  if (!snapshot.tentacleId) {
    throw new Error("Missing tentacleId in response");
  }

  const agent: SandboxAgent = {
    tentacleId: snapshot.tentacleId,
    terminalId: `${snapshot.tentacleId}-agent-1`,
  };
  if (snapshot.initialPrompt) {
    agent.initialPrompt = snapshot.initialPrompt;
  }
  return agent;
};

const sendPromptToTerminal = (terminalId: string, prompt: string) => {
  const ws = new WebSocket(buildTerminalSocketUrl(terminalId));
  ws.addEventListener("open", () => {
    ws.send(JSON.stringify({ type: "input", data: prompt }));
    ws.close();
  });
};

const SandboxPromptInput = ({ terminalId }: { terminalId: string }) => {
  const [prompt, setPrompt] = useState("");

  const handleSend = () => {
    const trimmed = prompt.trim();
    if (trimmed.length === 0) {
      return;
    }
    sendPromptToTerminal(terminalId, trimmed);
    setPrompt("");
  };

  return (
    <div className="sandbox-prompt-input">
      <input
        type="text"
        className="sandbox-prompt-field"
        placeholder="Type a prompt to inject..."
        value={prompt}
        onChange={(e) => {
          setPrompt(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            handleSend();
          }
        }}
      />
      <ActionButton
        onClick={handleSend}
        disabled={prompt.trim().length === 0}
        size="compact"
        variant="info"
      >
        Inject
      </ActionButton>
    </div>
  );
};

export const SandboxPrimaryView = () => {
  const [agents, setAgents] = useState<SandboxAgent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const initializedRef = useRef(false);

  const addAgent = useCallback(async () => {
    try {
      setIsCreating(true);
      setError(null);
      const agent = await createSandboxTentacleRequest();
      setAgents((current) => [...current, agent]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setIsCreating(false);
    }
  }, []);

  const removeAgent = useCallback(async (tentacleId: string) => {
    try {
      await fetch(buildTentacleRenameUrl(tentacleId), {
        method: "DELETE",
        headers: { Accept: "application/json" },
      });
      setAgents((current) => current.filter((a) => a.tentacleId !== tentacleId));
    } catch {
      setError("Failed to delete agent");
    }
  }, []);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    void addAgent();
  }, [addAgent]);

  if (error && agents.length === 0) {
    return (
      <section className="sandbox-view" aria-label="Sandbox">
        <div className="sandbox-view-status">
          <p>Failed to initialize sandbox: {error}</p>
          <button
            type="button"
            onClick={() => {
              void addAgent();
            }}
          >
            Retry
          </button>
        </div>
      </section>
    );
  }

  if (agents.length === 0) {
    return (
      <section className="sandbox-view" aria-label="Sandbox">
        <div className="sandbox-view-status">
          <p>Initializing sandbox tentacle...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="sandbox-view" aria-label="Sandbox">
      <div className="sandbox-toolbar">
        <ActionButton
          onClick={() => {
            void addAgent();
          }}
          disabled={isCreating}
          size="compact"
          variant="info"
        >
          {isCreating ? "Creating..." : "+ New Agent"}
        </ActionButton>
        {error && <span className="sandbox-toolbar-error">{error}</span>}
      </div>
      <div className="sandbox-terminals">
        {agents.map((agent) => (
          <div key={agent.terminalId} className="sandbox-terminal-panel">
            <Terminal
              terminalId={agent.terminalId}
              terminalLabel="Sandbox Agent"
              {...(agent.initialPrompt ? { initialPrompt: agent.initialPrompt } : {})}
            />
            <SandboxPromptInput terminalId={agent.terminalId} />
          </div>
        ))}
      </div>
    </section>
  );
};

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SETUP_STATE_RELATIVE_PATH = join("state", "setup.json");

export type SetupState = {
  version: 1;
  tentaclesInitializedAt?: string;
};

export const readSetupState = (stateDir: string): SetupState => {
  const filePath = join(stateDir, SETUP_STATE_RELATIVE_PATH);
  if (!existsSync(filePath)) {
    return { version: 1 };
  }

  try {
    const raw = JSON.parse(readFileSync(filePath, "utf-8")) as Partial<SetupState>;
    return {
      version: 1,
      ...(typeof raw.tentaclesInitializedAt === "string"
        ? { tentaclesInitializedAt: raw.tentaclesInitializedAt }
        : {}),
    };
  } catch {
    return { version: 1 };
  }
};

export const writeSetupState = (stateDir: string, state: SetupState) => {
  mkdirSync(join(stateDir, "state"), { recursive: true });
  writeFileSync(join(stateDir, SETUP_STATE_RELATIVE_PATH), `${JSON.stringify(state, null, 2)}\n`);
};

export const markTentaclesInitialized = (stateDir: string) => {
  const currentState = readSetupState(stateDir);
  if (currentState.tentaclesInitializedAt) {
    return;
  }

  writeSetupState(stateDir, {
    ...currentState,
    tentaclesInitializedAt: new Date().toISOString(),
  });
};

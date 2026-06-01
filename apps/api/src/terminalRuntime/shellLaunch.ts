export type ShellLaunch = {
  command: string;
  args: string[];
};

export const formatShellSpawnError = (command: string, detail: string): string => {
  // node-pty reports PTY-allocation failures (most commonly the OS running
  // out of pseudo-terminals) as a generic "posix_spawnp failed" with no
  // errno. Surface an actionable hint instead of the cryptic native message.
  const looksLikePtyExhaustion = /posix_spawn|forkpty|openpty/i.test(detail);
  const hint = looksLikePtyExhaustion
    ? " The system may be out of pseudo-terminals (PTYs). Close other terminal sessions, or raise the limit (macOS: sudo sysctl -w kern.tty.ptmx_max=999; Linux: increase /proc/sys/kernel/pty/max)."
    : "";
  return `Unable to start terminal shell (${command}): ${detail}${hint}`;
};

export const getShellLaunch = (): ShellLaunch => {
  if (process.platform === "win32") {
    return {
      command: process.env.ComSpec ?? "cmd.exe",
      args: [],
    };
  }

  const shellFromEnvironment = process.env.SHELL?.trim();
  if (shellFromEnvironment && shellFromEnvironment.length > 0) {
    return {
      command: shellFromEnvironment,
      args: ["-i"],
    };
  }

  return {
    command: "/bin/bash",
    args: ["-i"],
  };
};

import { randomBytes, timingSafeEqual } from "node:crypto";

export type PairingService = {
  /** Constant-time comparison of a candidate token against the session token. */
  verifyToken(token: string): boolean;
  /** The process-lifetime pairing token. Never persisted to disk. */
  getToken(): string | null;
};

/**
 * Creates an in-memory pairing service. A cryptographically-random token is
 * generated once at startup and held only for the process lifetime — it is never
 * written to disk. Verification uses a constant-time comparison with a length
 * guard so it returns false (rather than throwing) on a length mismatch.
 */
export const createPairingService = (): PairingService => {
  const token = randomBytes(32).toString("hex");
  const tokenBuffer = Buffer.from(token, "utf8");

  return {
    getToken: () => token,
    verifyToken: (candidate: string): boolean => {
      if (typeof candidate !== "string") {
        return false;
      }
      const candidateBuffer = Buffer.from(candidate, "utf8");
      // timingSafeEqual throws on differing lengths; guard first so a mismatched
      // length is a clean `false` and the comparison stays constant-time for
      // equal-length inputs.
      if (candidateBuffer.length !== tokenBuffer.length) {
        return false;
      }
      return timingSafeEqual(candidateBuffer, tokenBuffer);
    },
  };
};

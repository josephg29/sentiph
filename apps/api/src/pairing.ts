export type PairingService = {
  verifyToken(token: string): boolean;
  getToken(): string | null;
};

export const createPairingService = (): PairingService => {
  return {
    verifyToken: () => false,
    getToken: () => null,
  };
};

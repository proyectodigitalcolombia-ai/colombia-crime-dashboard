declare global {
  namespace Express {
    interface Request {
      transportUserId?: number;
      transportRole?: string;
      transportTenantId?: number | null;
    }
  }
}

export {};

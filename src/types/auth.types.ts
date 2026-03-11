export interface UserInfo {
  id: string;
  email: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: UserInfo;
      isInternalService?: boolean;
    }
  }
}

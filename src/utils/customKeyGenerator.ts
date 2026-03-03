import { ipKeyGenerator } from "express-rate-limit";

export const customKeyGenerator = (req: any, res: any) => {
  return ipKeyGenerator(req, res);
};

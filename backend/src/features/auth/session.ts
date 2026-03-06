import { sign } from "./jwt.ts";

export function handleSession(sessionSecret: string) {
  return async (): Promise<Response> => {
    const token = await sign({ iat: Date.now() }, sessionSecret);
    return Response.json({ token });
  };
}

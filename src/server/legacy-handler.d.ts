declare module "*.mjs" {
  import type { IncomingMessage, ServerResponse } from "node:http";

  export function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void>;
}

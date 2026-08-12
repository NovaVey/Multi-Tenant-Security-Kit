/**
 * Minimal, framework-agnostic HTTP types shared by every middleware factory
 * in this kit.
 *
 * These are intentionally *structural* subsets of what Express (and most
 * Express-alike frameworks — Connect, Fastify with its Express-compat layer,
 * etc.) already provide, so `express.Request` / `express.Response` satisfy
 * them with zero adapter code. We avoid a hard dependency on `express`'s
 * types so this package stays framework-light; consumers get full
 * type-compatibility for free via structural typing.
 */

export interface MinimalRequest {
  headers: Record<string, string | string[] | undefined>;
  hostname?: string;
  method?: string;
  url?: string;
  /** Allow frameworks to attach arbitrary properties (e.g. `req.user`). */
  [key: string]: unknown;
}

export interface MinimalResponse {
  statusCode?: number;
  status(code: number): this;
  json(body: unknown): this;
  setHeader(name: string, value: string | number): this;
  [key: string]: unknown;
}

export type NextFunction = (err?: unknown) => void;

export type Middleware<
  Req extends MinimalRequest = MinimalRequest,
  Res extends MinimalResponse = MinimalResponse,
> = (req: Req, res: Res, next: NextFunction) => void;

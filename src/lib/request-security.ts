export class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/** Cookie-authenticated mutations require an exact configured origin, not a caller-supplied Host. */
export function isTrustedMutation(request: Request, configuredOrigin?: string): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method.toUpperCase())) return true;
  if (request.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = request.headers.get("origin");
  if (!origin || !configuredOrigin) return false;
  try { return new URL(origin).origin === new URL(configuredOrigin).origin; } catch { return false; }
}

export async function readBodyLimited(request: Request, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  if (!Number.isFinite(length) || length < 0 || length > maxBytes) throw new RequestError(413, "Request is too large");
  if (!request.body) throw new RequestError(400, "Request body is required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) {
        await reader.cancel();
        throw new RequestError(413, "Request is too large");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return body;
}

export async function readJsonLimited(request: Request, maxBytes = 65536): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new RequestError(415, "Use application/json");
  const body = await readBodyLimited(request, maxBytes);
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(body)); }
  catch { throw new RequestError(400, "Invalid JSON"); }
}


export async function readFormDataLimited(request: Request, maxBytes: number): Promise<FormData> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) throw new RequestError(415, "Use multipart/form-data");
  const body = await readBodyLimited(request, maxBytes);
  try {
    return await new Response(body, { headers: { "content-type": contentType } }).formData();
  } catch { throw new RequestError(400, "Invalid multipart upload"); }
}

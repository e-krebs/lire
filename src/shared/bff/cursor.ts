import { z } from "zod";

// The paging token: base64url JSON, because NewsBlur pages by number. A search cursor also holds
// its query, so a page can't be fetched for a different one.

const CursorSchema = z.object({
  page: z.number().int().positive(),
  q: z.string().optional(),
});
export type Cursor = z.infer<typeof CursorSchema>;

export const encodeCursor = (cursor: Cursor): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
};

export const decodeCursor = (token: string): Cursor | null => {
  try {
    const binary = atob(token.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const parsed = CursorSchema.safeParse(JSON.parse(new TextDecoder().decode(bytes)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

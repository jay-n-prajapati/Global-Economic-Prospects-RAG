import { z } from "zod";

const schema = z.object({
  GEMINI_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  RAG_DEBUG: z.enum(["0", "1"]).default("0"),
});

export const env = schema.parse(process.env);

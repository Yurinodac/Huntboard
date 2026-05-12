import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().default(5179),
});

export const config = envSchema.parse(process.env);

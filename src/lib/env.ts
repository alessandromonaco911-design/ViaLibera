import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1)
    .url()
    .refine((v) => v.startsWith("postgres://"), {
      message: "DATABASE_URL must start with postgres://",
    }),
  POSTGRES_DB: z.string().min(1).default("scuolaguida"),
  POSTGRES_USER: z.string().min(1).default("scuolaguida"),
  POSTGRES_PORT: z.coerce.number().int().positive().default(5433),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables. Check .env against .env.example.");
}

export const env = parsed.data;

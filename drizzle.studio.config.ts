import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./db/studio-schema.ts",
  dialect: "sqlite",
});

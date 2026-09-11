import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "dist/**",
    "outputs/**",
    "tmp/**",
    "work/**",
    "backups/**",
    ".wrangler/**",
    ".pnpm-store/**",
    "supabase/.temp/**",
    // Cópias de publicação e bibliotecas externas são validadas pelos testes
    // próprios e não devem duplicar os avisos do código-fonte oficial.
    "web/**",
    "vendor/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

import typescript from "eslint-config-next/typescript";

export default [
  ...typescript,
  { ignores: ["**/dist/**", "**/node_modules/**", "**/next-env.d.ts"] },
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] } },
];

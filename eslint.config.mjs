import typescript from "eslint-config-next/typescript";

export default [
  ...typescript,
  { ignores: ["**/.next/**", "**/dist/**", "**/node_modules/**", "**/next-env.d.ts", "**/convex/_generated/**"] },
  { rules: { "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }] } },
];

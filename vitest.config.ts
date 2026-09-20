import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Vitest had no config, so it had no idea what `@/` meant. Every test that
 * needed a module under that alias supplied it by hand with `vi.mock`, which
 * worked for as long as nobody added a NEW shared module: the moment
 * `@/components/ui/icon` appeared in four components, four suites failed to
 * collect with "Cannot find package", and the only available fix was four
 * more hand-written mocks.
 *
 * The alias is the same one `tsconfig.json` declares, so a test now resolves
 * imports the way the app does. Existing `vi.mock("@/…")` calls are
 * unaffected: a mock intercepts before resolution, so they still replace
 * whatever they were replacing.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
    },
  },
});

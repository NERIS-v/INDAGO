import "@testing-library/jest-dom/vitest";
import { configure } from "@testing-library/react";

// The full suite runs dozens of files in parallel on dev machines where a
// freshly-mounted WorkspaceProvider (async demo/live providers) can take longer
// than the 1s default to become queryable. Bump the async-utility budget so
// findBy*/waitFor retry under contention instead of flaking; genuine assertion
// failures still surface, just after more retries.
configure({ asyncUtilTimeout: 15000 });
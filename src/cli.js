import { runPipeline } from "./index.js";

runPipeline().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

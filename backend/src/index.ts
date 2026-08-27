import "dotenv/config";
import express from "express";
import cors from "cors";
import { getAuthClient } from "./auth/google";
import { startScheduler } from "./scheduler";
import apiRoutes from "./api/routes";

const PORT = process.env.PORT ?? 3001;

async function main() {
  console.log("=== Presence Tracker ===");

  // 1. Verify service account is configured
  console.log("\n[Auth] Checking service account...");
  getAuthClient();
  console.log("[Auth] Service account OK");

  // 2. Start the Express API
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use("/api", apiRoutes);

  app.listen(PORT, () => {
    console.log(`[API] Server running at http://localhost:${PORT}`);
  });

  // 3. Start the calendar scheduler
  startScheduler();

  console.log("\nPresence Tracker is running. Press Ctrl+C to stop.\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});

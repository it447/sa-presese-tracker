/**
 * Vercel serverless entry point — wraps the Express app.
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import apiRoutes from "../src/api/routes";
import cronRoutes from "../src/api/cron";

const app = express();
app.use(cors());
app.use(express.json());
app.use("/api", apiRoutes);
app.use("/api/cron", cronRoutes);

export default app;

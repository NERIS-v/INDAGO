import express from "express";
import cors from "cors";
import helmet from "helmet";
import { apiRouter } from "./routes.js";
import { createRouteHandler } from "uploadthing/express";
import { uploadRouter } from "./uploadthing.js";

const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors());
app.use(express.json());

// UploadThing route handler
app.use(
  "/api/uploadthing",
  createRouteHandler({
    router: uploadRouter,
  })
);

// Routes
app.use("/api/v1", apiRouter);

// Health check endpoint
app.get("/health", (_req, res) => {
  res.status(200).json({ status: "healthy", service: "indago-platform" });
});

const PORT = process.env.PORT || 3000;

export function startServer() {
  app.listen(PORT, () => {
    console.log(`🚀 INDAGO Execution Platform running on port ${PORT}`);
  });
}

startServer();
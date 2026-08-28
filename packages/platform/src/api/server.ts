import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { apiRouter } from "./routes.js";
import { createRouteHandler } from "uploadthing/express";
import { uploadRouter } from "./uploadthing.js";

const app = express();

// Middleware
// Configure Helmet to allow UI shell scripts and CDN
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
        connectSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "blob:"],
      },
    },
  })
);
app.use(cors());
app.use(express.json());

app.use(express.static(path.join(process.cwd(), "public")));

// UploadThing route handler
//
// ingestUrl is resolved from UPLOADTHING_INGEST_URL when provided, otherwise
// the UploadThing SDK performs its own region discovery. No region is
// hardcoded here. See packages/platform/.env.example.
app.use(
  "/api/uploadthing",
  createRouteHandler({
    router: uploadRouter,
    config: {
      ingestUrl: process.env.UPLOADTHING_INGEST_URL || undefined,
    }
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
    console.log(`📡 SSE Stream ready for Phase 3 UI shell`);
  });
}

startServer();
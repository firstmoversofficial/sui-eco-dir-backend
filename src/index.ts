import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import compression from 'compression';
import dotenv from 'dotenv';

import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { projectRoutes } from './routes/projectRoutes.js';
import { videoRoutes } from './routes/videoRoutes.js';
import { categoryRoutes } from './routes/categoryRoutes.js';
import { healthRoutes } from './routes/healthRoutes.js';
import { authRoutes } from './routes/authRoutes.js';
import { adminRoutes } from './routes/adminRoutes.js';
import { uploadRoutes } from './routes/uploadRoutes.js';
import supabaseStorageService from './services/supabaseStorageService.js';

// Load environment variables
dotenv.config();

// Initialize Supabase Storage bucket
supabaseStorageService.initializeBucket().catch(console.error);

const app: express.Application = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : [];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  })
);

// Compression middleware
app.use(compression());

// Logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API routes
const apiPrefix = process.env.API_PREFIX || '/api/v1';
app.use(`${apiPrefix}/health`, healthRoutes);
app.use(`${apiPrefix}/auth`, authRoutes);
app.use(`${apiPrefix}/admin`, adminRoutes);
app.use(`${apiPrefix}/projects`, projectRoutes);
app.use(`${apiPrefix}/videos`, videoRoutes);
app.use(`${apiPrefix}/categories`, categoryRoutes);
app.use(`${apiPrefix}/upload`, uploadRoutes);

// Error handling middleware
app.use(notFoundHandler);
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check: http://localhost:${PORT}${apiPrefix}/health`);
  console.log(`API Base URL: http://localhost:${PORT}${apiPrefix}`);
});

export default app;

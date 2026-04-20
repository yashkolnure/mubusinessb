require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const compression  = require('compression');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');
const path         = require('path');
const xss          = require('xss-clean');
const hpp          = require('hpp');

const { env, validateEnv }    = require('./config/env');
const logger                  = require('./config/logger');
const { apiLimiter }          = require('./middleware/rateLimiter.middleware');
const { auditMiddleware }     = require('./middleware/auditLog.middleware');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler.middleware');
const routes                  = require('./routes/index');

// Validate required env vars on startup
validateEnv();

const app = express();

// ── Trust proxy (for correct IP behind nginx/load balancer) ───
app.set('trust proxy', 1);

// ── Security headers ──────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: env.IS_PRODUCTION ? undefined : false,
}));

// ── CORS ──────────────────────────────────────────────────────
const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = env.FRONTEND_URL.split(',').map((u) => u.trim());
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: Origin ${origin} not allowed`));
    }
  },
  credentials:         true,
  methods:             ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
  allowedHeaders:      ['Content-Type','Authorization','X-Requested-With'],
  exposedHeaders:      ['X-Total-Count','X-Page','X-Limit'],
  optionsSuccessStatus:200,
};
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ── Compression ────────────────────────────────────────────────
app.use(compression());

// ── Body parsers ───────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// ── XSS & HPP protection ──────────────────────────────────────
app.use(xss());
app.use(hpp());

// ── HTTP request logger ───────────────────────────────────────
if (env.IS_DEVELOPMENT) {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined', {
    stream: { write: (message) => logger.http(message.trim()) },
    skip:   (req) => req.url === `${env.API_PREFIX}/health`,
  }));
}

// ── Static files (uploads) ────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
  maxAge:  '7d',
  etag:    true,
  setHeaders: (res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

// ── Global API rate limiter ───────────────────────────────────
app.use(env.API_PREFIX, apiLimiter);

// ── Audit log helper on every request ────────────────────────
app.use(auditMiddleware);

// ── API routes ────────────────────────────────────────────────
app.use(env.API_PREFIX, routes);

// ── 404 handler ───────────────────────────────────────────────
app.use(notFoundHandler);

// ── Global error handler (must be last) ───────────────────────
app.use(errorHandler);

module.exports = app;

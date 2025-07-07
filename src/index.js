const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

// Import routes
const authRoutes = require('./routes/auth.routes'); // Will be created for AUTH-01
const notesRoutes = require('./routes/notes.routes');

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Basic Route
app.get('/', (req, res) => {
  res.send('Synapse Studio Backend is running!');
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/notes', notesRoutes);


// Global error handler (basic)
// This should be more sophisticated in a production app
app.use((err, req, res, next) => {
  console.error("Global Error Handler:", err.stack);
  // Check if the error is from multer (e.g., file size limit)
  if (err.code && err.code.startsWith('LIMIT_')) {
    return res.status(400).json({ error: `Upload Error: ${err.message}` });
  }
  // Check for Prisma known errors (e.g. P2025 Record not found)
  if (err.code && err.code.startsWith('P')) {
      if (err.code === 'P2025') {
          return res.status(404).json({ error: err.meta?.cause || "Record not found." });
      }
      // Add more specific Prisma error codes as needed
      return res.status(400).json({ error: `Database Error: ${err.message}`});
  }

  res.status(err.status || 500).json({
    error: err.message || 'An unexpected error occurred.',
  });
});


// Function to gracefully shut down the server
async function shutdown(signal) {
  console.log(`\n${signal} signal received. Shutting down gracefully...`);
  try {
    await prisma.$disconnect();
    console.log('Prisma client disconnected.');
    server.close(() => {
      console.log('HTTP server closed.');
      process.exit(0);
    });
  } catch (e) {
    console.error('Error during shutdown:', e);
    process.exit(1);
  }
}

// Start server and listen for signals
const server = app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  try {
    await prisma.$connect();
    console.log('Prisma client connected to the database.');
  } catch (e) {
    console.error('Failed to connect to the database. Server not started.', e);
    process.exit(1); // Exit if DB connection fails
  }
});

// Listen for termination signals
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT')); // Catches Ctrl+C

module.exports = app; // For potential testing

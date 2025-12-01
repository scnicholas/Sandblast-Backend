const express = require('express');
const cors = require('cors');

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Use Render's port or default to 3000 locally
const PORT = process.env.PORT || 3000;

// Health check route
app.get('/', (req, res) => {
  res.status(200).send('Sandblast backend is alive on Render.\n');
});

// Simple test endpoint for now
app.post('/api/sandblast-gpt', (req, res) => {
  const { message = "" } = req.body || {};
  res.json({
    reply: `Sandblast backend received: "${message}"`
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Sandblast backend listening on port ${PORT}`);
});

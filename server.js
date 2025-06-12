const express = require('express');
const path = require('path');
const app = express();
const port = 3000;

// This is the magic part:
// These headers are required to enable SharedArrayBuffer
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  next();
});

// Serve the static files (html, css, js) from the current directory
app.use(express.static(path.join(__dirname, '')));

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log('Cross-Origin Isolation headers are now being served.');
});
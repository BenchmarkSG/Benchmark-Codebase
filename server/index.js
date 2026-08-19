import './env.js'; // load .env before app.js modules read process.env
import { createApp } from './app.js';

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`FeeOptima API listening on http://localhost:${PORT}`);
});

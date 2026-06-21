import express from 'express';
import axios from 'axios';
import canvasRoutes from './routes/canvasRoutes.js';
import { getToken } from './services/spotifyAuthService.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3000;

app.use('/api/canvas', canvasRoutes);

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q param' });
  try {
    const token = await getToken();
    if (!token) {
      console.error('Search: getToken() returned null/undefined');
      return res.status(500).json({ error: 'Failed to get Spotify token' });
    }
    console.log('Search: got token, searching for:', q);
    const response = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );
    console.log('Search: Spotify responded with status', response.status);
    res.json(response.data);
  } catch (e) {
    console.error('Search endpoint error:', e.response?.status, e.response?.data, e.message);
    res.status(500).json({ error: e.message, detail: e.response?.data });
  }
});

app.listen(PORT, function () {
    console.log("Listening on PORT: ", PORT);
    if (PORT == 3000) { 
      console.log('Running on local: http://localhost:3000');
    }
});

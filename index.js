import express from 'express';
import axios from 'axios';
import canvasRoutes from './routes/canvasRoutes.js';
import { getToken } from './services/spotifyAuthService.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3000;

app.use('/api/canvas', canvasRoutes);

// Simple in-memory search cache (server-side)
const searchCache = new Map();
const SEARCH_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q param' });

  // Check cache first
  const cached = searchCache.get(q);
  if (cached && Date.now() < cached.expiresAt) {
    console.log('Search cache hit for:', q);
    return res.json(cached.data);
  }

  try {
    const token = await getToken();
    if (!token) {
      console.error('Search: getToken() returned null/undefined');
      return res.status(500).json({ error: 'Failed to get Spotify token' });
    }

    // Small delay to avoid hammering Spotify
    await new Promise(resolve => setTimeout(resolve, 500));

    const response = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`,
      { headers: { 'Authorization': `Bearer ${token}` } }
    );

    // Cache the result
    searchCache.set(q, { data: response.data, expiresAt: Date.now() + SEARCH_CACHE_TTL });
    console.log('Search: success for:', q);
    res.json(response.data);

  } catch (e) {
    const status = e.response?.status;
    console.error('Search endpoint error:', status, e.message);

    // If rate limited, wait and retry once
    if (status === 429) {
      console.log('Rate limited, retrying after 2s...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const token2 = await getToken();
        const retry = await axios.get(
          `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=5`,
          { headers: { 'Authorization': `Bearer ${token2}` } }
        );
        searchCache.set(q, { data: retry.data, expiresAt: Date.now() + SEARCH_CACHE_TTL });
        return res.json(retry.data);
      } catch (e2) {
        console.error('Retry also failed:', e2.response?.status, e2.message);
        return res.status(429).json({ error: 'Rate limited by Spotify, try again later' });
      }
    }

    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, function () {
    console.log("Listening on PORT: ", PORT);
    if (PORT == 3000) { 
      console.log('Running on local: http://localhost:3000');
    }
});

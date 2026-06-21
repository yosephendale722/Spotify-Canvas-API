import express from 'express';
import axios from 'axios';
import canvasRoutes from './routes/canvasRoutes.js';
import { getToken } from './services/spotifyAuthService.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 3000;

app.use('/api/canvas', canvasRoutes);

const searchCache = new Map();
const SEARCH_CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  if (!q) return res.status(400).json({ error: 'Missing q param' });

  const cached = searchCache.get(q);
  if (cached && Date.now() < cached.expiresAt) {
    console.log('Search cache hit for:', q);
    return res.json(cached.data);
  }

  try {
    const token = await getToken();
    if (!token) return res.status(500).json({ error: 'Failed to get token' });

    const variables = encodeURIComponent(JSON.stringify({
      searchTerm: q,
      offset: 0,
      limit: 5,
      numberOfTopResults: 1,
      includeAudiobooks: false
    }));

    const extensions = encodeURIComponent(JSON.stringify({
      persistedQuery: {
        version: 1,
        sha256Hash: "7a60179c5d6b4171c7c28f1c574e4491b0c4f38d3c3b9c3b2f7a02aef38deae"
      }
    }));

    const url = `https://api-partner.spotify.com/pathfinder/v1/query?operationName=searchDesktop&variables=${variables}&extensions=${extensions}`;

    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Origin': 'https://open.spotify.com',
        'Referer': 'https://open.spotify.com/',
        'app-platform': 'WebPlayer',
        'spotify-app-version': '1.2.46.25.g7f189073'
      }
    });

    const tracks = response.data?.data?.searchV2?.tracksV2?.items;
    if (!tracks || tracks.length === 0) {
      return res.status(404).json({ error: 'No results found' });
    }

    const firstTrack = tracks[0]?.item?.data;
    const trackId = firstTrack?.uri?.split(':')[2];

    if (!trackId) return res.status(404).json({ error: 'No track ID found' });

    console.log('Partner search found:', trackId, 'for:', q);

    const result = {
      tracks: {
        items: [{
          id: trackId,
          name: firstTrack?.name || '',
          artists: [{ name: firstTrack?.artists?.items?.[0]?.profile?.name || '' }]
        }]
      }
    };

    searchCache.set(q, { data: result, expiresAt: Date.now() + SEARCH_CACHE_TTL });
    res.json(result);

  } catch (e) {
    console.error('Partner search error:', e.response?.status, e.response?.data, e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, function () {
    console.log("Listening on PORT: ", PORT);
    if (PORT == 3000) { 
      console.log('Running on local: http://localhost:3000');
    }
});

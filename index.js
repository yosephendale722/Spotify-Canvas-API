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

  // Check cache first
  const cached = searchCache.get(q);
  if (cached && Date.now() < cached.expiresAt) {
    console.log('Search cache hit for:', q);
    return res.json(cached.data);
  }

  try {
    // Use MusicBrainz to find the Spotify track ID — completely free, no auth needed
    const encoded = encodeURIComponent(q);
    const mbUrl = `https://musicbrainz.org/ws/2/recording/?query=${encoded}&limit=5&fmt=json`;

    const mbResponse = await axios.get(mbUrl, {
      headers: {
        // MusicBrainz requires a User-Agent identifying your app
        'User-Agent': 'Noog/1.0 ( noog@example.com )'
      }
    });

    const recordings = mbResponse.data?.recordings;
    if (!recordings || recordings.length === 0) {
      return res.status(404).json({ error: 'No results found' });
    }

    // Find the first recording that has a Spotify URL relation
    let spotifyTrackId = null;
    for (const recording of recordings) {
      const relations = recording['url-rels'] || [];
      for (const rel of relations) {
        const url = rel.url?.resource || '';
        if (url.includes('open.spotify.com/track/')) {
          spotifyTrackId = url.split('/track/')[1].split('?')[0];
          break;
        }
      }
      if (spotifyTrackId) break;
    }

    // MusicBrainz basic search doesn't include url-rels, so fetch the first recording's details
    if (!spotifyTrackId && recordings[0]?.id) {
      const detailUrl = `https://musicbrainz.org/ws/2/recording/${recordings[0].id}?inc=url-rels&fmt=json`;
      const detailResponse = await axios.get(detailUrl, {
        headers: { 'User-Agent': 'Noog/1.0 ( noog@example.com )' }
      });
      const relations = detailResponse.data?.relations || [];
      for (const rel of relations) {
        const url = rel.url?.resource || '';
        if (url.includes('open.spotify.com/track/')) {
          spotifyTrackId = url.split('/track/')[1].split('?')[0];
          break;
        }
      }
    }

    if (!spotifyTrackId) {
      console.log('No Spotify ID found on MusicBrainz for:', q);
      return res.status(404).json({ error: 'No Spotify track ID found' });
    }

    console.log('MusicBrainz found Spotify track ID:', spotifyTrackId, 'for:', q);

    // Return in same format as Spotify search so the Android app needs no changes
    const result = {
      tracks: {
        items: [{
          id: spotifyTrackId,
          name: recordings[0]?.title || '',
          artists: [{ name: recordings[0]?.['artist-credit']?.[0]?.name || '' }]
        }]
      }
    };

    searchCache.set(q, { data: result, expiresAt: Date.now() + SEARCH_CACHE_TTL });
    res.json(result);

  } catch (e) {
    console.error('Search endpoint error:', e.response?.status, e.message);
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, function () {
    console.log("Listening on PORT: ", PORT);
    if (PORT == 3000) { 
      console.log('Running on local: http://localhost:3000');
    }
});

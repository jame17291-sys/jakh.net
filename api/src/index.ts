import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import authRoutes from './routes/auth';
import userRoutes from './routes/user';
import teamRoutes from './routes/team';
import analyticsRoutes from './routes/analytics';
import adminRoutes from './routes/admin';
import suggestionRoutes from './routes/suggestions';
import ttsRoutes from './routes/tts';
import leaderboardRoutes from './routes/leaderboard';
import battleRoutes, { setupBattleWebSocket } from './routes/battle';

dotenv.config();

const app = express();
app.set("trust proxy", 1);
const port = process.env.PORT || 3000;

app.use(helmet());
app.use(cors({ origin: 'https://jakh.net', credentials: true }));
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/user', userRoutes);
app.use('/api/team', teamRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/suggestions', suggestionRoutes);
app.use('/api/tts', ttsRoutes);
app.use('/api/leaderboard', leaderboardRoutes);
app.use('/api/battle', battleRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'JAKH Riddles API is running' });
});

// HTTP server + WebSocket
const httpServer = createServer(app);
const wss = new WebSocketServer({ noServer: true });
setupBattleWebSocket(wss);

httpServer.on('upgrade', (request, socket, head) => {
  if (request.url === '/ws/battle') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

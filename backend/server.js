import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import jwt from 'jsonwebtoken';

import authRoutes, { authenticateToken } from './routes/auth.js';
import { startMatchmakingLoop } from './services/matchmaker.js';
import { setupSocketEvents } from './game_engine.js';

dotenv.config();

const { Pool } = pg;
const poolConfig = process.env.DATABASE_URL 
  ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
  : {
      user: 'postgres',
      host: 'localhost',
      database: '1v1_platform',
      password: process.env.DB_PASSWORD || 'VideoConnorBlitz81234',
      port: 5432,
    };

export const pool = new Pool(poolConfig);

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);

// Protected Profile Route
app.get('/api/profile/me', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query('SELECT id, username, elo, created_at FROM users WHERE id = $1', [req.user.id]);
        if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
        res.json(result.rows[0]);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Leaderboard Route
app.get('/api/leaderboard', async (req, res) => {
    try {
        const result = await pool.query('SELECT username, elo FROM users ORDER BY elo DESC LIMIT 10');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*' }
});

// WebSocket Authentication Middleware
io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));

    jwt.verify(token, process.env.JWT_SECRET || 'super_secret_dev_key', (err, decoded) => {
        if (err) return next(new Error('Authentication error'));
        
        // Fetch full user info from DB to get fresh Elo
        pool.query('SELECT id, username, elo FROM users WHERE id = $1', [decoded.id])
            .then(result => {
                if(result.rows.length > 0) {
                    socket.user = result.rows[0];
                    next();
                } else {
                    next(new Error('User not found'));
                }
            })
            .catch(() => next(new Error('Database error')));
    });
});

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.id})`);
    
    // Подключаем логику игры и очередей
    setupSocketEvents(io, socket);
});

// Запускаем фоновый цикл матчмейкинга
startMatchmakingLoop(io);

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server Version 3.0 running on http://localhost:${PORT}`);
});

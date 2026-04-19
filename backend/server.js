import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import { handleMatchmaking } from './matchmaking.js';
import { generateProblem } from './ai_generator.js';

dotenv.config();

const { Pool } = pg;
export const pool = new Pool({
  user: 'postgres',
  host: 'localhost',
  database: '1v1_platform',
  password: process.env.DB_PASSWORD || 'VideoConnorBlitz81234', // ЗАМЕНИТЕ НА СВОЙ ПАРОЛЬ!
  port: 5432,
});

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
  }
});

// Простой API для проверки статуса
app.get('/api/status', (req, res) => {
  res.json({ status: 'Backend is running!' });
});

// API для получения профиля (заглушка для MVP)
app.get('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    let result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    
    // Если пользователя нет, создадим его автоматически (для простоты тестов)
    if (result.rows.length === 0) {
      await pool.query('INSERT INTO users (username) VALUES ($1)', [username]);
      result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Database error' });
  }
});

// WebSocket соединения
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);
  
  // Авторизация по username
  socket.on('authenticate', (username) => {
    socket.username = username;
    console.log(`${username} authenticated on ${socket.id}`);
  });

  // Логика подбора игроков
  handleMatchmaking(io, socket, pool);

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

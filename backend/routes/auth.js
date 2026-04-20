import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../server.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_dev_key';

// Регистрация
router.post('/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

        const userExists = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        if (userExists.rows.length > 0) return res.status(400).json({ error: 'Username already taken' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = await pool.query(
            'INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username, elo',
            [username, hashedPassword]
        );

        const token = jwt.sign({ id: newUser.rows[0].id, username }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: newUser.rows[0] });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Логин
router.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const userQuery = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
        
        if (userQuery.rows.length === 0) return res.status(400).json({ error: 'Invalid credentials' });
        
        const user = userQuery.rows[0];
        
        // Для старых пользователей без пароля
        if (!user.password_hash) {
            return res.status(400).json({ error: 'Account requires password reset (old account)'});
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) return res.status(400).json({ error: 'Invalid credentials' });

        const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
        
        res.json({ 
            token, 
            user: { id: user.id, username: user.username, elo: user.elo }
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// Middleware для защиты роутов
export const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) return res.sendStatus(401);

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) return res.sendStatus(403);
        req.user = user;
        next();
    });
};

export default router;

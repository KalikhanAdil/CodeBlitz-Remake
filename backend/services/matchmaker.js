import { redis } from './redisClient.js';
import { generateProblem } from '../ai_generator.js';
import crypto from 'crypto';

// Глобальный Game Engine State для запущенных матчей
// В проде это хранится тоже в Redis, но для MVP храним в памяти
export const activeMatches = new Map(); 

export function startMatchmakingLoop(io) {
    console.log("🛠 Matchmaking worker started...");
    
    setInterval(async () => {
        try {
            const queueItems = await redis.lrange('match_queue', 0, -1);
            if (queueItems.length < 2) return;

            let players = queueItems.map(p => JSON.parse(p));
            
            // Сортируем: кто дольше ждет, тот первый
            players.sort((a, b) => a.joinedAt - b.joinedAt);

            for (let i = 0; i < players.length; i++) {
                let matched = false;
                for (let j = i + 1; j < players.length; j++) {
                    const p1 = players[i];
                    const p2 = players[j];
                    
                    const waitTime = (Date.now() - p1.joinedAt) / 1000;
                    // Каждую секунду поиска разброс Elo увеличивается на 10
                    const allowedDiff = 50 + (waitTime * 10); 

                    if (Math.abs(p1.elo - p2.elo) <= allowedDiff) {
                        // Матч найден
                        matched = true;
                        
                        // Удаляем из очереди
                        await redis.lrem('match_queue', 1, JSON.stringify(p1));
                        await redis.lrem('match_queue', 1, JSON.stringify(p2));
                        
                        // Вычеркиваем из текущего локального массива, чтобы не сматчить дважды
                        players.splice(j, 1);
                        
                        const matchId = `match_${crypto.randomUUID()}`;
                        
                        // Сообщаем игрокам
                        io.to(p1.socketId).emit('match_loading', { message: 'Match found! Generating problem...' });
                        io.to(p2.socketId).emit('match_loading', { message: 'Match found! Generating problem...' });
                        
                        // Асинхронно генерируем задачу, чтобы не блокировать цикл
                        generateAndStartMatch(io, matchId, p1, p2);
                        break;
                    }
                }
                if (matched) {
                    // p1 тоже удален из рассмотрения, идем дальше
                    players.splice(i, 1);
                    i--; // Корректируем индекс
                }
            }
        } catch (error) {
            console.error("Matchmaking Loop Error:", error);
        }
    }, 2000); // Раз в 2 секунды
}

async function generateAndStartMatch(io, matchId, p1, p2) {
    const avgElo = Math.floor((p1.elo + p2.elo) / 2);
    try {
        const problem = await generateProblem(avgElo);
        
        // Инициализируем State машины матча
        activeMatches.set(matchId, {
            id: matchId,
            p1, p2,
            problem,
            startTime: Date.now(),
            status: 'playing'
        });

        const matchPayload = {
            matchId,
            problem,
            opponent: {
                [p1.socketId]: p2.username,
                [p2.socketId]: p1.username
            }
        };

        io.to(p1.socketId).emit('match_start', matchPayload);
        io.to(p2.socketId).emit('match_start', matchPayload);

    } catch (e) {
        console.error('AI Generation Failed:', e);
        io.to(p1.socketId).emit('match_error', { message: 'Failed to generate problem.' });
        io.to(p2.socketId).emit('match_error', { message: 'Failed to generate problem.' });
    }
}

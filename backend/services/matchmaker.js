import { redis } from './redisClient.js';
import { generateProblem } from '../ai_generator.js';
import crypto from 'crypto';

// Глобальный Game Engine State для запущенных матчей
export const activeMatches = new Map(); 

// Список ботов с увеличенным временем (чтобы игроки успевали решать)
const BOT_PROFILES = [
    { username: 'Bot_Newbie', elo: 800, solveTimeMin: 300, solveTimeMax: 600, winChance: 0.3 },   // 5-10 минут
    { username: 'Bot_Easy', elo: 1000, solveTimeMin: 240, solveTimeMax: 420, winChance: 0.4 },    // 4-7 минут
    { username: 'Bot_Medium', elo: 1400, solveTimeMin: 180, solveTimeMax: 300, winChance: 0.6 },  // 3-5 минут
    { username: 'Bot_Hard', elo: 1800, solveTimeMin: 120, solveTimeMax: 240, winChance: 0.75 },   // 2-4 минуты
    { username: 'Bot_Master', elo: 2200, solveTimeMin: 60, solveTimeMax: 150, winChance: 0.9 },   // 1-2.5 минуты
];

function pickBot(playerElo) {
    // Выбираем бота с ближайшим Elo к игроку
    let best = BOT_PROFILES[0];
    let bestDiff = Math.abs(best.elo - playerElo);
    for (const bot of BOT_PROFILES) {
        const diff = Math.abs(bot.elo - playerElo);
        if (diff < bestDiff) {
            best = bot;
            bestDiff = diff;
        }
    }
    return { ...best, id: `bot_${crypto.randomUUID()}`, socketId: `bot_${crypto.randomUUID()}`, isBot: true };
}

export function startMatchmakingLoop(io) {
    console.log("🛠 Matchmaking worker started...");
    
    setInterval(async () => {
        try {
            const queueItems = await redis.lrange('match_queue', 0, -1);
            if (queueItems.length === 0) return;

            let players = queueItems.map(p => JSON.parse(p));
            players.sort((a, b) => a.joinedAt - b.joinedAt);

            let matchedIds = new Set();

            // Шаг 1: Пытаемся найти реальные матчи
            for (let i = 0; i < players.length; i++) {
                if (matchedIds.has(i)) continue;
                
                for (let j = i + 1; j < players.length; j++) {
                    if (matchedIds.has(j)) continue;
                    
                    const p1 = players[i];
                    const p2 = players[j];
                    
                    const waitTime = (Date.now() - p1.joinedAt) / 1000;
                    const allowedDiff = 50 + (waitTime * 10);

                    if (Math.abs(p1.elo - p2.elo) <= allowedDiff) {
                        matchedIds.add(i);
                        matchedIds.add(j);
                        
                        await redis.lrem('match_queue', 1, JSON.stringify(p1));
                        await redis.lrem('match_queue', 1, JSON.stringify(p2));
                        
                        io.to(p1.socketId).emit('match_loading', { message: 'Match found! Generating problem...' });
                        io.to(p2.socketId).emit('match_loading', { message: 'Match found! Generating problem...' });
                        
                        generateAndStartMatch(io, p1, p2);
                        break;
                    }
                }
            }

            // Шаг 2: Проверяем, кто ждёт дольше 30 секунд — подключаем бота
            for (let i = 0; i < players.length; i++) {
                if (matchedIds.has(i)) continue;
                
                const p = players[i];
                const waitTime = (Date.now() - p.joinedAt) / 1000;
                
                if (waitTime >= 30) {
                    console.log(`⏰ ${p.username} waited ${Math.floor(waitTime)}s — spawning bot`);
                    
                    await redis.lrem('match_queue', 1, JSON.stringify(p));
                    
                    const bot = pickBot(p.elo);
                    
                    io.to(p.socketId).emit('match_loading', { message: 'No opponents found. Starting match with AI Bot...' });
                    
                    generateAndStartBotMatch(io, p, bot);
                }
            }
        } catch (error) {
            console.error("Matchmaking Loop Error:", error);
        }
    }, 2000);
}

async function generateAndStartMatch(io, p1, p2) {
    const matchId = `match_${crypto.randomUUID()}`;
    const avgElo = Math.floor((p1.elo + p2.elo) / 2);
    
    try {
        const problem = await generateProblem(avgElo);
        
        activeMatches.set(matchId, {
            id: matchId, p1, p2, problem,
            startTime: Date.now(), status: 'playing', isBot: false
        });

        const matchPayload = {
            matchId, problem,
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

async function generateAndStartBotMatch(io, player, bot) {
    const matchId = `match_${crypto.randomUUID()}`;
    
    try {
        const problem = await generateProblem(player.elo);
        
        activeMatches.set(matchId, {
            id: matchId,
            p1: player,
            p2: bot,
            problem,
            startTime: Date.now(),
            status: 'playing',
            isBot: true
        });

        const matchPayload = {
            matchId, problem,
            opponent: {
                [player.socketId]: `🤖 ${bot.username}`
            }
        };

        io.to(player.socketId).emit('match_start', matchPayload);

        // Бот "решает" задачу через случайное время
        const solveTime = bot.solveTimeMin + Math.random() * (bot.solveTimeMax - bot.solveTimeMin);
        console.log(`🤖 ${bot.username} will attempt to solve in ${Math.floor(solveTime)}s`);

        setTimeout(() => {
            const match = activeMatches.get(matchId);
            if (!match || match.status !== 'playing') return; // Игрок уже победил

            // Бот отправляет "неудачную попытку" через половину времени
            io.to(player.socketId).emit('opponent_status', { event: 'testing' });
            
            setTimeout(() => {
                const match2 = activeMatches.get(matchId);
                if (!match2 || match2.status !== 'playing') return;

                // Бросаем кубик: решит ли бот задачу
                if (Math.random() < bot.winChance) {
                    // Бот решил — игрок проиграл
                    match2.status = 'finished';
                    io.to(player.socketId).emit('match_ended', {
                        winner: `🤖 ${bot.username}`,
                        reason: 'first_correct',
                        eloChangeWinner: 0,
                        eloChangeLoser: -15,
                        winnerElo: bot.elo,
                        loserElo: player.elo - 15
                    });
                    activeMatches.delete(matchId);
                } else {
                    // Бот ошибся
                    io.to(player.socketId).emit('opponent_status', { event: 'wrong_answer' });
                }
            }, 5000); // 5 секунд на "тестирование"
        }, solveTime * 1000);

    } catch (e) {
        console.error('Bot match generation failed:', e);
        io.to(player.socketId).emit('match_error', { message: 'Failed to generate problem.' });
    }
}

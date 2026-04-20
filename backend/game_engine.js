import { redis } from './services/redisClient.js';
import { activeMatches } from './services/matchmaker.js';
import { executeCode } from './code_runner.js';
import { pool } from './db.js';

export function setupSocketEvents(io, socket) {
    
    socket.on('join_queue', async () => {
        if (!socket.user) return;
        
        const playerInfo = {
            id: socket.user.id,
            username: socket.user.username,
            socketId: socket.id,
            elo: socket.user.elo,
            joinedAt: Date.now()
        };
        
        await redis.lpush('match_queue', JSON.stringify(playerInfo));
        console.log(`${socket.user.username} joined queue (Elo: ${socket.user.elo})`);
    });

    socket.on('leave_queue', async () => {
        if (!socket.user) return;
        // Для MVP MockRedis удалит просто по совпадению JSON.
        // В реальном Redis нужно вытащить список, найти по ID и удалить. 
        // Здесь мы упрощаем.
        const queueItems = await redis.lrange('match_queue', 0, -1);
        for(let item of queueItems) {
            let p = JSON.parse(item);
            if(p.id === socket.user.id) {
                await redis.lrem('match_queue', 1, item);
            }
        }
    });

    socket.on('submit_code', async (data) => {
        const { matchId, code, language } = data;
        const match = activeMatches.get(matchId);
        if (!match) return;
        
        console.log(`[Submission] ${socket.user.username} submitted ${language} code`);
        socket.to(matchId).emit('opponent_status', { event: 'testing' });

        const result = await executeCode(code, language, match.problem.testCases, socket);
        
        if (result.success) {
            // Игрок победил!
            match.status = 'finished';
            
            // Расчет ELO (упрощенно)
            const isP1 = match.p1.socketId === socket.id;
            const winner = isP1 ? match.p1 : match.p2;
            const loser = isP1 ? match.p2 : match.p1;
            
            const K = 30; // Коэффициент Elo
            const expectedScoreWinner = 1 / (1 + Math.pow(10, (loser.elo - winner.elo) / 400));
            const expectedScoreLoser = 1 / (1 + Math.pow(10, (winner.elo - loser.elo) / 400));
            
            const newWinnerElo = Math.round(winner.elo + K * (1 - expectedScoreWinner));
            const newLoserElo = Math.round(loser.elo + K * (0 - expectedScoreLoser));

            // Обновляем в БД
            await pool.query('UPDATE users SET elo = $1 WHERE id = $2', [newWinnerElo, winner.id]);
            await pool.query('UPDATE users SET elo = $1 WHERE id = $2', [newLoserElo, loser.id]);

            io.to(matchId).emit('match_ended', { 
                winner: winner.username, 
                reason: 'first_correct',
                winnerElo: newWinnerElo,
                loserElo: newLoserElo,
                eloChangeWinner: newWinnerElo - winner.elo,
                eloChangeLoser: newLoserElo - loser.elo
            });

            activeMatches.delete(matchId);
        } else {
            socket.emit('submission_result', { status: 'wrong_answer', details: result });
            socket.to(matchId).emit('opponent_status', { event: 'wrong_answer' });
        }
    });

    socket.on('disconnect', async () => {
        if (!socket.user) return;
        // Очистка очереди
        const queueItems = await redis.lrange('match_queue', 0, -1);
        for(let item of queueItems) {
            let p = JSON.parse(item);
            if(p.id === socket.user.id) {
                await redis.lrem('match_queue', 1, item);
            }
        }
        
        // Техническое поражение (Forfeit), если был в матче
        for (let [matchId, match] of activeMatches.entries()) {
            if (match.p1.socketId === socket.id || match.p2.socketId === socket.id) {
                const winner = match.p1.socketId === socket.id ? match.p2.username : match.p1.username;
                io.to(matchId).emit('match_ended', { 
                    winner, 
                    reason: 'opponent_disconnected',
                    eloChangeWinner: 0, eloChangeLoser: 0 // Упростили без вычета Elo для MVP
                });
                activeMatches.delete(matchId);
            }
        }
    });
}

import { generateProblem } from './ai_generator.js';
import { executeCode } from './code_runner.js';

// Очередь ожидания (в памяти)
// queue[0] = { socket, username, elo, joinedAt }
let queue = [];
let activeMatches = {}; // matchId -> { player1, player2, problem, startTime }

export const handleMatchmaking = (io, socket, pool) => {
  
  socket.on('join_queue', async () => {
    if (!socket.username) return;
    
    // Получаем Elo из базы
    const res = await pool.query('SELECT elo FROM users WHERE username = $1', [socket.username]);
    const elo = res.rows.length > 0 ? res.rows[0].elo : 1000;
    
    const playerInfo = {
      id: socket.id,
      socket,
      username: socket.username,
      elo,
      joinedAt: Date.now()
    };
    
    queue.push(playerInfo);
    console.log(`${socket.username} joined queue (Elo: ${elo})`);
    
    // Пытаемся найти матч
    tryMatch(io, pool);
  });

  socket.on('leave_queue', () => {
    queue = queue.filter(p => p.id !== socket.id);
  });
  
  // Обработка отправки кода (Submission)
  socket.on('submit_code', async (data) => {
    const { matchId, code, language } = data;
    const match = activeMatches[matchId];
    if (!match) return;
    
    console.log(`[Submission] ${socket.username} submitted ${language} code for match ${matchId}`);
    
    // Сообщаем сопернику, что мы проверяем код
    socket.to(matchId).emit('opponent_status', { event: 'testing' });

    // Запускаем реальную проверку кода
    const result = await executeCode(code, language, match.problem.testCases, socket);
    
    if (result.success) {
        // Игрок победил
        io.to(matchId).emit('match_ended', { winner: socket.username, reason: 'first_correct' });
        delete activeMatches[matchId];
    } else {
        // Неверный ответ
        socket.emit('submission_result', { status: 'wrong_answer', details: result });
        // Сообщаем сопернику, что другой игрок ошибся
        socket.to(matchId).emit('opponent_status', { event: 'wrong_answer' });
    }
  });
};

async function tryMatch(io, pool) {
  if (queue.length >= 2) {
    // В MVP просто берем первых двух
    const p1 = queue.shift();
    const p2 = queue.shift();
    
    console.log(`Match found! ${p1.username} vs ${p2.username}`);
    const matchId = `match_${Date.now()}`;
    
    p1.socket.join(matchId);
    p2.socket.join(matchId);
    
    const avgElo = Math.floor((p1.elo + p2.elo) / 2);
    
    // Отправляем сообщение о начале генерации задачи
    io.to(matchId).emit('match_loading', { message: 'AI generating problem...' });
    
    // Генерируем задачу через AI
    try {
        const problem = await generateProblem(avgElo);
        
        // Записываем матч в активные
        activeMatches[matchId] = { player1: p1, player2: p2, problem, startTime: Date.now() };
        
        io.to(matchId).emit('match_start', { 
            matchId, 
            problem,
            opponent: {
                [p1.id]: p2.username,
                [p2.id]: p1.username
            }
        });
    } catch (e) {
        console.error('Failed to generate problem:', e);
        io.to(matchId).emit('match_error', { message: 'Failed to generate problem via AI' });
    }
  }
}

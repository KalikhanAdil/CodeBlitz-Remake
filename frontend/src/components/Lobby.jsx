import React, { useState, useEffect } from 'react';

export default function Lobby({ socket, username, isLoading, setIsLoading }) {
  const [inQueue, setInQueue] = useState(false);
  const [elo, setElo] = useState(1000);
  const [waitTimer, setWaitTimer] = useState(0);

  useEffect(() => {
    // Получение профиля (в MVP просто делаем GET запрос)
    fetch(`http://localhost:3001/api/users/${username}`)
      .then(res => res.json())
      .then(data => {
        if(data && data.elo) setElo(data.elo);
      })
      .catch(console.error);
  }, [username]);

  useEffect(() => {
    let interval;
    if (inQueue) {
      interval = setInterval(() => {
        setWaitTimer(prev => prev + 1);
      }, 1000);
    } else {
      setWaitTimer(0);
    }
    return () => clearInterval(interval);
  }, [inQueue]);

  useEffect(() => {
    socket.on('match_loading', (data) => {
      setIsLoading(true);
    });
    return () => socket.off('match_loading');
  }, [socket, setIsLoading]);

  const toggleQueue = () => {
    if (inQueue) {
      socket.emit('leave_queue');
      setInQueue(false);
    } else {
      socket.emit('join_queue');
      setInQueue(true);
    }
  };

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="lobby-container">
      <div className="glass profile-card">
        <div className="avatar">
          {username.substring(0, 2).toUpperCase()}
        </div>
        <h2 className="username">{username}</h2>
        <div className="elo-badge">ELO: {elo}</div>
      </div>

      <div className="glass matchmaking-box">
        {isLoading ? (
          <>
            <div className="pulse-ring" style={{ background: 'var(--accent)' }}></div>
            <h3 style={{ color: 'var(--accent)' }}>AI is generating the problem...</h3>
            <p style={{ marginTop: '1rem', color: 'var(--text-muted)' }}>Match found! Preparing arena.</p>
          </>
        ) : inQueue ? (
          <>
            <div className="pulse-ring"></div>
            <h3>Searching for Opponent...</h3>
            <p style={{ marginTop: '1rem', fontSize: '1.5rem', fontFamily: 'monospace' }}>
              {formatTime(waitTimer)}
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginBottom: '2rem' }}>
              Expanding search radius (±{(Math.floor(waitTimer / 10) + 1) * 50} Elo)
            </p>
            <button className="btn btn-danger" onClick={toggleQueue}>Cancel Search</button>
          </>
        ) : (
          <>
            <h2 style={{ marginBottom: '2rem' }}>Ready to compete?</h2>
            <button className="btn" onClick={toggleQueue} style={{ padding: '1rem 3rem', fontSize: '1.2rem' }}>
              Start Match
            </button>
          </>
        )}
      </div>
    </div>
  );
}

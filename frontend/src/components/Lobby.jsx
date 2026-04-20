import React, { useState, useEffect } from 'react';

export default function Lobby({ socket, user, apiUrl, searching, loading, onSearch, onCancel }) {
  const [leaderboard, setLeaderboard] = useState([]);
  const [waitTimer, setWaitTimer] = useState(0);

  useEffect(() => {
    fetch(`${apiUrl}/api/leaderboard`)
      .then(res => res.json())
      .then(data => setLeaderboard(data))
      .catch(console.error);
  }, [apiUrl]);

  useEffect(() => {
    let interval;
    if (searching) {
      interval = setInterval(() => setWaitTimer(prev => prev + 1), 1000);
    } else {
      setWaitTimer(0);
    }
    return () => clearInterval(interval);
  }, [searching]);

  const handleStartSearch = () => {
    socket.emit('join_queue');
    onSearch();
  };

  const getRankInfo = (elo) => {
    if (elo >= 2500) return { name: 'Master', color: '#ef4444', icon: '👑' };
    if (elo >= 2200) return { name: 'Diamond', color: '#60a5fa', icon: '💎' };
    if (elo >= 1900) return { name: 'Platinum', color: '#2dd4bf', icon: '⚡' };
    if (elo >= 1600) return { name: 'Gold', color: '#fbbf24', icon: '🥇' };
    if (elo >= 1200) return { name: 'Silver', color: '#94a3b8', icon: '🥈' };
    return { name: 'Bronze', color: '#cd7c32', icon: '🥉' };
  };

  const rank = getRankInfo(user.elo);

  return (
    <div className="lobby-container">
      <div className="lobby-grid">
        {/* Left: Profile + Search */}
        <div className="lobby-left">
          <div className="glass profile-card">
            <div className="avatar">{user.username.substring(0, 2).toUpperCase()}</div>
            <h2 className="username">{user.username}</h2>
            <div className="rank-badge" style={{ borderColor: rank.color, color: rank.color }}>
              {rank.icon} {rank.name}
            </div>
            <div className="elo-display">{user.elo} ELO</div>
          </div>

          <div className="glass matchmaking-box">
            {loading ? (
              <>
                <div className="pulse-ring accent"></div>
                <h3 style={{ color: 'var(--accent)' }}>Generating Problem...</h3>
                <p className="text-muted">Match found! Preparing arena.</p>
              </>
            ) : searching ? (
              <>
                <div className="pulse-ring"></div>
                <h3>Searching for Opponent...</h3>
                <p className="timer-text">{Math.floor(waitTimer / 60)}:{String(waitTimer % 60).padStart(2, '0')}</p>
                <p className="text-muted">Search radius: ±{50 + (waitTimer * 10)} Elo</p>
                <button className="btn btn-danger" onClick={onCancel} style={{ marginTop: '1.5rem' }}>Cancel</button>
              </>
            ) : (
              <>
                <h2 style={{ marginBottom: '0.5rem' }}>Ready to Battle?</h2>
                <p className="text-muted" style={{ marginBottom: '2rem' }}>Find an opponent and solve a problem first to win!</p>
                <button className="btn btn-lg" onClick={handleStartSearch}>⚔️ Start Match</button>
              </>
            )}
          </div>
        </div>

        {/* Right: Leaderboard */}
        <div className="lobby-right">
          <div className="glass leaderboard-card">
            <h3 className="leaderboard-title">🏆 Leaderboard</h3>
            <div className="leaderboard-list">
              {leaderboard.map((player, index) => {
                const pRank = getRankInfo(player.elo);
                return (
                  <div key={index} className={`leaderboard-row ${player.username === user.username ? 'highlight' : ''}`}>
                    <span className="lb-position">#{index + 1}</span>
                    <span className="lb-name">{player.username}</span>
                    <span className="lb-elo" style={{ color: pRank.color }}>{player.elo}</span>
                  </div>
                );
              })}
              {leaderboard.length === 0 && (
                <p className="text-muted" style={{ textAlign: 'center', padding: '2rem' }}>No players yet. Be the first!</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

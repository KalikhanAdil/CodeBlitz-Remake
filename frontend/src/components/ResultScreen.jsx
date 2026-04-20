import React from 'react';

export default function ResultScreen({ data, username, onBack }) {
  const isWinner = data.winner === username;
  const eloChange = isWinner ? data.eloChangeWinner : data.eloChangeLoser;

  return (
    <div className="result-screen">
      <div className="glass result-card">
        <div className={`result-icon ${isWinner ? 'win' : 'loss'}`}>
          {isWinner ? '🏆' : '💀'}
        </div>
        <h1 className={`result-title ${isWinner ? 'win' : 'loss'}`}>
          {isWinner ? 'VICTORY!' : 'DEFEAT'}
        </h1>
        <p className="result-reason">
          {data.reason === 'first_correct' ? 'First correct submission!' : 'Opponent disconnected.'}
        </p>

        <div className="result-stats">
          <div className="stat-item">
            <span className="stat-label">Winner</span>
            <span className="stat-value">{data.winner}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Elo Change</span>
            <span className={`stat-value ${eloChange >= 0 ? 'positive' : 'negative'}`}>
              {eloChange >= 0 ? '+' : ''}{eloChange}
            </span>
          </div>
        </div>

        <button className="btn btn-lg" onClick={onBack} style={{ marginTop: '2rem' }}>
          Back to Lobby
        </button>
      </div>
    </div>
  );
}

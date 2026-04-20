import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import AuthScreen from './components/AuthScreen';
import Lobby from './components/Lobby';
import MatchScreen from './components/MatchScreen';
import ResultScreen from './components/ResultScreen';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

function App() {
  const [socket, setSocket] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  
  // Game State: 'lobby' | 'searching' | 'loading' | 'playing' | 'result'
  const [gameState, setGameState] = useState('lobby');
  const [matchData, setMatchData] = useState(null);
  const [resultData, setResultData] = useState(null);

  // При наличии токена — подключаем сокет и грузим профиль
  useEffect(() => {
    if (!token) {
      if (socket) socket.disconnect();
      setSocket(null);
      setUser(null);
      return;
    }

    // Загрузка профиля
    fetch(`${API_URL}/api/profile/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => {
        if (!res.ok) throw new Error('Token expired');
        return res.json();
      })
      .then(data => setUser(data))
      .catch(() => {
        localStorage.removeItem('token');
        setToken(null);
      });

    // Подключение WebSocket с JWT
    const newSocket = io(API_URL, {
      auth: { token }
    });

    newSocket.on('connect_error', (err) => {
      console.error('Socket Auth Error:', err.message);
      if (err.message === 'Authentication error') {
        localStorage.removeItem('token');
        setToken(null);
      }
    });

    newSocket.on('match_loading', () => {
      setGameState('loading');
    });

    newSocket.on('match_start', (data) => {
      setMatchData(data);
      setGameState('playing');
    });

    newSocket.on('match_error', (data) => {
      alert(data.message);
      setGameState('lobby');
    });

    newSocket.on('match_ended', (data) => {
      setResultData(data);
      setGameState('result');
      // Обновляем профиль (свежий Elo)
      fetch(`${API_URL}/api/profile/me`, {
        headers: { 'Authorization': `Bearer ${token}` }
      }).then(r => r.json()).then(setUser).catch(console.error);
    });

    setSocket(newSocket);
    return () => newSocket.close();
  }, [token]);

  const handleLogin = (newToken, userData) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    setGameState('lobby');
    if (socket) socket.disconnect();
  };

  const handleBackToLobby = () => {
    setGameState('lobby');
    setMatchData(null);
    setResultData(null);
  };

  // Экран авторизации
  if (!token || !user) {
    return <AuthScreen apiUrl={API_URL} onLogin={handleLogin} />;
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">CodeBlitz</div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span className="elo-badge">⚡ {user.elo}</span>
          <span style={{ fontWeight: 500 }}>{user.username}</span>
          {gameState === 'playing' && (
            <button className="btn btn-danger btn-sm" onClick={handleBackToLobby}>Forfeit</button>
          )}
          <button className="btn-ghost" onClick={handleLogout}>Log Out</button>
        </div>
      </header>

      {gameState === 'lobby' && (
        <Lobby socket={socket} user={user} apiUrl={API_URL} onSearch={() => setGameState('searching')} />
      )}
      {gameState === 'searching' && (
        <Lobby socket={socket} user={user} apiUrl={API_URL} searching={true} onCancel={() => {
          socket.emit('leave_queue');
          setGameState('lobby');
        }} />
      )}
      {gameState === 'loading' && (
        <Lobby socket={socket} user={user} apiUrl={API_URL} loading={true} />
      )}
      {gameState === 'playing' && matchData && (
        <MatchScreen socket={socket} matchData={matchData} username={user.username} />
      )}
      {gameState === 'result' && resultData && (
        <ResultScreen data={resultData} username={user.username} onBack={handleBackToLobby} />
      )}
    </div>
  );
}

export default App;

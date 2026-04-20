import React, { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Lobby from './components/Lobby';
import MatchScreen from './components/MatchScreen';

const SOCKET_URL = 'https://codeblitz-remake-1.onrender.com';

function App() {
  const [socket, setSocket] = useState(null);
  const [username, setUsername] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  
  // Game State
  const [matchData, setMatchData] = useState(null); // null = in lobby, object = in match
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    const newSocket = io(SOCKET_URL, { autoConnect: false });
    
    newSocket.on('match_start', (data) => {
      setIsLoading(false);
      setMatchData(data);
    });

    newSocket.on('match_error', (data) => {
      alert(data.message);
      setIsLoading(false);
    });

    newSocket.on('match_ended', (data) => {
        alert(`Match Ended! Winner: ${data.winner}`);
        setMatchData(null); // Return to lobby
    });

    setSocket(newSocket);

    return () => newSocket.close();
  }, []);

  const handleLogin = (e) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    socket.connect();
    socket.emit('authenticate', username);
    setIsLoggedIn(true);
  };

  if (!isLoggedIn) {
    return (
      <div className="login-screen">
        <div className="glass login-form">
          <h1 className="logo" style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>1v1 Blitz</h1>
          <p style={{ color: 'var(--text-muted)' }}>Enter your username to begin coding</p>
          <form onSubmit={handleLogin}>
            <input 
              type="text" 
              placeholder="Username..." 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
            <button type="submit" className="btn" style={{ width: '100%' }}>Enter Arena</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <header className="header">
        <div className="logo">1v1 Blitz</div>
        <div className="user-info" style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontWeight: 500 }}>{username}</span>
            {matchData && (
                <button 
                  className="btn btn-danger" 
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                  onClick={() => setMatchData(null)} // Заглушка: покинуть матч
                >
                  Forfeit
                </button>
            )}
        </div>
      </header>

      {!matchData ? (
        <Lobby 
          socket={socket} 
          username={username} 
          isLoading={isLoading} 
          setIsLoading={setIsLoading} 
        />
      ) : (
        <MatchScreen 
          socket={socket} 
          matchData={matchData} 
          username={username} 
        />
      )}
    </div>
  );
}

export default App;

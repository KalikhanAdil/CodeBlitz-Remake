import React, { useState, useEffect } from 'react';
import Editor from "@monaco-editor/react";

const LANGUAGE_TEMPLATES = {
    javascript: `const fs = require('fs');
// readFileSync(0) is a cross-platform way to read from stdin
const input = fs.readFileSync(0, 'utf-8').trim();

// Your logic here
console.log(input);
`,
    python: `import sys
input_data = sys.stdin.read().strip()

# Your logic here
print(input_data)
`
};

export default function MatchScreen({ socket, matchData, username }) {
  const { matchId, problem, opponent } = matchData;
  const opponentName = opponent[Object.keys(opponent).find(id => opponent[id] !== username)];
  
  const [language, setLanguage] = useState('javascript');
  const [code, setCode] = useState(LANGUAGE_TEMPLATES.javascript);
  const [opponentStatus, setOpponentStatus] = useState('coding');
  const [terminalLogs, setTerminalLogs] = useState([]);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    socket.on('opponent_status', (data) => {
        setOpponentStatus(data.event);
        if (data.event === 'wrong_answer' || data.event === 'testing') {
            setTimeout(() => setOpponentStatus('coding'), 4000);
        }
    });

    socket.on('execution_update', (data) => {
        setTerminalLogs(prev => [...prev, data.message]);
    });

    socket.on('submission_result', (data) => {
        setIsExecuting(false);
        if (data.status === 'wrong_answer') {
            setTerminalLogs(prev => [...prev, '💥 Submission Failed! Check your logic.']);
        }
    });

    return () => {
        socket.off('opponent_status');
        socket.off('execution_update');
        socket.off('submission_result');
    }
  }, [socket]);

  const handleLanguageChange = (e) => {
      const newLang = e.target.value;
      setLanguage(newLang);
      setCode(LANGUAGE_TEMPLATES[newLang]);
  };

  const handleSubmit = () => {
    setIsExecuting(true);
    setTerminalLogs(['> Sending code to server...']);
    socket.emit('submit_code', { matchId, code, language });
  };

  return (
    <div className="match-container">
      {/* Левая панель - Задача */}
      <div className="glass problem-panel">
        <div className="problem-header" style={{ borderBottom: '1px solid var(--card-border)' }}>
          <h2 className="problem-title">{problem.title}</h2>
          <div className="match-info">
            <span>Vs. <strong style={{color: 'white'}}>{opponentName}</strong></span>
            <span style={{ color: 'var(--accent)' }}>First to solve wins</span>
          </div>
        </div>
        
        <div className="problem-description">
          <div style={{ whiteSpace: 'pre-wrap', marginBottom: '2rem' }}>
            {problem.statement}
          </div>
          
          <h4 style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Input Format</h4>
          <pre>{problem.inputFormat}</pre>
          
          <h4 style={{ color: 'var(--text-muted)', margin: '1.5rem 0 0.5rem' }}>Output Format</h4>
          <pre>{problem.outputFormat}</pre>

          <h4 style={{ color: 'var(--text-muted)', margin: '1.5rem 0 0.5rem' }}>Example Test Case</h4>
          {problem.testCases && problem.testCases[0] && (
              <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{flex: 1}}>
                      <strong>Input:</strong>
                      <pre>{problem.testCases[0].input}</pre>
                  </div>
                  <div style={{flex: 1}}>
                      <strong>Output:</strong>
                      <pre>{problem.testCases[0].output}</pre>
                  </div>
              </div>
          )}
        </div>
      </div>

      {/* Правая панель - Редактор */}
      <div className="glass editor-panel">
        <div className="action-bar" style={{ borderBottom: '1px solid var(--card-border)' }}>
          <div className="opponent-status">
            <div className={`status-dot ${opponentStatus === 'coding' ? 'active' : ''} ${opponentStatus === 'testing' ? 'testing' : ''}`}></div>
            {opponentName}: {opponentStatus === 'wrong_answer' ? <span style={{color: 'var(--danger)'}}>Failed attempt</span> : opponentStatus === 'testing' ? <span style={{color: 'var(--accent)'}}>Running Tests...</span> : 'Coding...'}
          </div>
          <div style={{display: 'flex', gap: '1rem', alignItems: 'center'}}>
            <select className="lang-select" value={language} onChange={handleLanguageChange}>
                <option value="javascript">Node.js</option>
                <option value="python">Python 3</option>
            </select>
            <button className="btn" onClick={handleSubmit} disabled={isExecuting}>
                {isExecuting ? 'Running...' : 'Submit Code'}
            </button>
          </div>
        </div>
        
        <div className="editor-wrapper">
          <Editor
            height="100%"
            language={language}
            theme="vs-dark"
            value={code}
            onChange={(value) => setCode(value)}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              fontFamily: "'JetBrains Mono', monospace",
              padding: { top: 16 }
            }}
          />
        </div>

        {/* Terminal Window */}
        <div className="terminal">
            <div className="terminal-header">Execution Logs</div>
            <div className="terminal-content">
                {terminalLogs.length === 0 ? (
                    <span style={{color: 'var(--text-muted)'}}>Waiting for submission...</span>
                ) : (
                    terminalLogs.map((log, i) => (
                        <div key={i} className={log.includes('Failed') || log.includes('Error') || log.includes('💥') ? 'log-error' : log.includes('Passed') ? 'log-success' : 'log-info'}>
                            {log.split('\n').map((line, j) => (
                                <div key={j}>{line}</div>
                            ))}
                        </div>
                    ))
                )}
            </div>
        </div>
      </div>
    </div>
  );
}

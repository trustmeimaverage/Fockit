import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import socket from '../socket';

const ANSWER_COLORS = ['var(--a0)', 'var(--a1)', 'var(--a2)', 'var(--a3)'];
const ANSWER_LABELS_QUIZ = ['A', 'B', 'C', 'D'];
const ANSWER_LABELS_TF = ['TRUE', 'FALSE'];

// ─── Subviews ─────────────────────────────────────────────────────────────────

function HostLobby({ pin, gameName, players, onStart }) {
  const canStart = players.length > 0;
  return (
    <div className="page">
      <div style={{ width: '100%', maxWidth: 560, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Logo */}
        <div className="logo-wrap" style={{ marginBottom: 32 }}>
          <span className="logo-text sm">Fockit!</span>
          <span className="logo-tagline">{gameName}</span>
        </div>

        {/* PIN box */}
        <div className="pin-box">
          <div className="pin-label">Room Code</div>
          <div className="pin-code">{pin}</div>
        </div>

        {/* Player count */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 8 }}>
          <span className="big-count">{players.length}</span>
          <span className="section-title">Players Joined</span>
        </div>
        <p className="text-muted" style={{ marginBottom: 20 }}>
          {players.length === 0 ? 'Waiting for players to join...' : 'Waiting for more players...'}
        </p>

        {/* Player list */}
        <div className="player-list lobby-scroll" style={{ marginBottom: 28 }}>
          {players.map(p => (
            <span key={p.nickname} className="player-chip">{p.nickname}</span>
          ))}
        </div>

        <button
          className={`btn ${canStart ? 'btn-brand' : 'btn-gray'} full-width`}
          disabled={!canStart}
          onClick={onStart}
        >
          {canStart ? 'Ready →' : 'Waiting for players...'}
        </button>
      </div>
    </div>
  );
}

function HostQuestion({ question, questionIndex, totalQuestions, timeLeft, timer, answerCount, totalPlayers, distribution }) {
  const pct = Math.max(0, timeLeft / timer);
  const urgent = timeLeft <= 5;
  const labels = question.type === 'truefalse' ? ANSWER_LABELS_TF : ANSWER_LABELS_QUIZ;
  const colors = question.type === 'truefalse'
    ? [ANSWER_COLORS[0], ANSWER_COLORS[3]]
    : ANSWER_COLORS;
  const maxDist = Math.max(1, ...distribution);

  return (
    <div className="host-view">
      {/* Header */}
      <div className="host-header" style={{ maxWidth: 700 }}>
        <span className="logo-text xs">Fockit!</span>
        <span className="host-q-counter">Question {questionIndex + 1} / {totalQuestions}</span>
      </div>

      {/* Timer bar */}
      <div className="timer-bar-wrap" style={{ maxWidth: 700 }}>
        <div className={`timer-bar ${urgent ? 'urgent' : ''}`} style={{ width: `${pct * 100}%` }} />
      </div>

      {/* Timer + question */}
      <div className={`q-timer ${urgent ? 'urgent' : ''}`}>{timeLeft}</div>
      <div className="q-text" style={{ maxWidth: 700 }}>{question.question}</div>

      {/* Answer distribution */}
      <div className="bar-chart" style={{ maxWidth: 700 }}>
        {distribution.map((count, i) => (
          <div key={i} className="bar-col">
            <span className="bar-label">{count}</span>
            <div
              className="bar-fill"
              style={{
                height: `${(count / maxDist) * 60}px`,
                background: colors[i],
              }}
            />
            <span className="bar-label">{labels[i]}</span>
          </div>
        ))}
      </div>

      <p className="text-muted" style={{ marginTop: 12 }}>
        {answerCount} / {totalPlayers} answered
      </p>
    </div>
  );
}

function HostResults({ question, questionIndex, totalQuestions, correctAnswer, answerStats, onNext, autoIn }) {
  const labels = question.type === 'truefalse' ? ANSWER_LABELS_TF : ANSWER_LABELS_QUIZ;
  const colors = question.type === 'truefalse'
    ? [ANSWER_COLORS[0], ANSWER_COLORS[3]]
    : ANSWER_COLORS;
  const total = answerStats.reduce((s, c) => s + c, 0) || 1;
  const isLast = questionIndex === totalQuestions - 1;

  return (
    <div className="host-view">
      <div className="host-header" style={{ maxWidth: 700 }}>
        <span className="logo-text xs">Fockit!</span>
        <span className="host-q-counter">Question {questionIndex + 1} / {totalQuestions}</span>
      </div>

      <div className="q-text" style={{ maxWidth: 700, marginBottom: 16 }}>{question.question}</div>

      {/* Results bar chart */}
      <div style={{ width: '100%', maxWidth: 700, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 24 }}>
        {answerStats.map((count, i) => {
          const pct = Math.round((count / total) * 100);
          const isCorrect = i === correctAnswer;
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 40, fontSize: 12, fontWeight: 800, color: 'var(--muted)' }}>{labels[i]}</span>
              <div style={{ flex: 1, height: 36, borderRadius: 4, background: '#E5E7EB', overflow: 'hidden', position: 'relative' }}>
                <div style={{
                  width: `${pct}%`, height: '100%',
                  background: isCorrect ? 'var(--green)' : colors[i],
                  transition: 'width 0.6s ease',
                  minWidth: count > 0 ? '4px' : 0,
                }} />
              </div>
              <span style={{
                width: 42, fontSize: 12, fontWeight: 800,
                color: isCorrect ? 'var(--green)' : 'var(--muted)',
                textAlign: 'right',
              }}>
                {count} {isCorrect ? '✓' : ''}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 700 }}>
        <button className="btn btn-brand" onClick={onNext} style={{ flex: 1 }}>
          {isLast ? 'See Results →' : `Next Question → (${autoIn}s)`}
        </button>
      </div>
    </div>
  );
}

function HostLeaderboard({ leaderboard, gameName, pin, onPlayAgain, onExit }) {
  return (
    <div className="page">
      <div style={{ width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="logo-wrap" style={{ marginBottom: 24 }}>
          <span className="logo-text sm">Fockit!</span>
          <span className="logo-tagline">Final Results</span>
        </div>

        <div className="leaderboard" style={{ marginBottom: 28 }}>
          {leaderboard.slice(0, 10).map((entry, i) => (
            <div key={entry.nickname} className="lb-row" style={i === 0 ? { borderColor: 'var(--brand)', borderWidth: 3 } : {}}>
              <span className="lb-rank">{i + 1}</span>
              <span className="lb-name">{entry.nickname}</span>
              <span className="lb-score">{entry.score}</span>
            </div>
          ))}
          {leaderboard.length === 0 && <p className="text-muted text-center">No players scored.</p>}
        </div>

        <button className="btn btn-brand full-width" style={{ marginBottom: 10 }} onClick={onPlayAgain}>
          Play Again
        </button>
        <button className="btn btn-dark full-width" onClick={onExit}>
          Exit
        </button>
      </div>
    </div>
  );
}

// ─── Countdown overlay ────────────────────────────────────────────────────────

function CountdownOverlay({ gameName, onDone }) {
  const [count, setCount] = useState(5);

  useEffect(() => {
    if (count <= 0) { onDone(); return; }
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count, onDone]);

  return (
    <div className="overlay-full fade-in">
      <div className="logo-wrap" style={{ marginBottom: 32 }}>
        <span className="logo-text sm">Fockit!</span>
        <span className="logo-tagline">Get Ready</span>
      </div>
      <span className="big-count" style={{ fontSize: 120 }}>{count}</span>
    </div>
  );
}

function QuizNameOverlay({ gameName, onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2500);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div className="overlay-full fade-in">
      <span style={{
        fontFamily: 'var(--font-ui)',
        fontWeight: 900,
        fontSize: 28,
        letterSpacing: 4,
        textTransform: 'uppercase',
        color: 'var(--brand)',
        textAlign: 'center',
        padding: '0 32px',
      }}>
        "{gameName}"
      </span>
    </div>
  );
}

// ─── Main HostPage ─────────────────────────────────────────────────────────────

export default function HostPage() {
  const { pin } = useParams();
  const navigate = useNavigate();

  const [view, setView] = useState('connecting'); // connecting | lobby | starting | quizname | countdown | question | results | end
  const [gameName, setGameName] = useState('');
  const [players, setPlayers] = useState([]);
  const [currentQ, setCurrentQ] = useState(null);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [endsAt, setEndsAt] = useState(null);
  const [answerCount, setAnswerCount] = useState(0);
  const [distribution, setDistribution] = useState([]);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [answerStats, setAnswerStats] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [hostDisconnected, setHostDisconnected] = useState(false);
  const [hostResumeIn, setHostResumeIn] = useState(0);
  const [autoIn, setAutoIn] = useState(8);

  const timerRef = useRef(null);
  const autoRef = useRef(null);

  // ── Connect on mount ──
  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.emit('host:join', { pin }, (res) => {
      if (!res.success) { navigate('/'); return; }
      setGameName(res.gameName);
      setTotalQuestions(res.totalQuestions);
      setPlayers(res.players || []);

      if (res.state === 'LOBBY') setView('lobby');
      else if (res.state === 'GAME_END') setView('end');
      else setView('lobby'); // reconnect — simplified; full rejoin logic would track state
    });

    return () => {
      socket.off('lobby:update');
      socket.off('game:starting');
      socket.off('question:start');
      socket.off('question:end');
      socket.off('host:answer_update');
      socket.off('game:end');
      socket.off('lobby:reset');
      socket.off('host:disconnected');
      socket.off('host:reconnected');
      socket.off('game:terminated');
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoRef.current) clearInterval(autoRef.current);
    };
  }, [pin, navigate]);

  // ── Socket events ──
  useEffect(() => {
    socket.on('lobby:update', ({ players }) => setPlayers(players));

    socket.on('game:starting', ({ gameName }) => {
      setGameName(gameName);
      setView('quizname');
    });

    socket.on('question:start', ({ question, type, options, timer, endsAt, questionIndex, totalQuestions }) => {
      setCurrentQ({ question, type, options, timer });
      setQuestionIndex(questionIndex);
      setTotalQuestions(totalQuestions);
      setEndsAt(endsAt);
      setAnswerCount(0);
      setDistribution(type === 'truefalse' ? [0, 0] : [0, 0, 0, 0]);
      setView('question');

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        setTimeLeft(left);
        if (left <= 0) clearInterval(timerRef.current);
      }, 250);
    });

    socket.on('host:answer_update', ({ answerCount, totalPlayers, distribution }) => {
      setAnswerCount(answerCount);
      setDistribution(distribution);
    });

    socket.on('question:end', ({ questionIndex, correctAnswer, answerStats, scores }) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setCorrectAnswer(correctAnswer);
      setAnswerStats(answerStats);
      setView('results');
      setLeaderboard(Object.entries(scores).map(([n, s]) => ({ nickname: n, score: s })).sort((a, b) => b.score - a.score));

      // Auto-advance countdown
      let a = 8;
      setAutoIn(a);
      if (autoRef.current) clearInterval(autoRef.current);
      autoRef.current = setInterval(() => {
        a--;
        setAutoIn(a);
        if (a <= 0) clearInterval(autoRef.current);
      }, 1000);
    });

    socket.on('game:end', ({ leaderboard }) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (autoRef.current) clearInterval(autoRef.current);
      setLeaderboard(leaderboard);
      setView('end');
    });

    socket.on('lobby:reset', ({ players }) => {
      setPlayers(players);
      setView('lobby');
      setLeaderboard([]);
      setQuestionIndex(0);
    });

    socket.on('host:disconnected', ({ resumeIn }) => {
      setHostDisconnected(true);
      setHostResumeIn(resumeIn);
    });

    socket.on('host:reconnected', () => setHostDisconnected(false));
    socket.on('game:terminated', () => navigate('/'));
  }, [navigate]);

  const handleStart = useCallback(() => {
    socket.emit('host:start', {}, (res) => {
      if (!res?.success) return;
    });
  }, []);

  const handleNext = useCallback(() => {
    if (autoRef.current) clearInterval(autoRef.current);
    socket.emit('host:next');
  }, []);

  const handlePlayAgain = useCallback(() => {
    socket.emit('host:play_again');
  }, []);

  // ── Render ──
  if (view === 'connecting') {
    return <div className="page"><p className="text-muted">Connecting...</p></div>;
  }

  if (view === 'quizname') {
    return <QuizNameOverlay gameName={gameName} onDone={() => setView('countdown')} />;
  }

  if (view === 'countdown' || view === 'starting') {
    return <CountdownOverlay gameName={gameName} onDone={() => {}} />;
  }

  if (view === 'lobby') {
    return <HostLobby pin={pin} gameName={gameName} players={players} onStart={handleStart} />;
  }

  if (view === 'question' && currentQ) {
    return (
      <>
        {hostDisconnected && (
          <div className="disconnect-banner">
            Host disconnected — reconnecting... ({hostResumeIn}s)
          </div>
        )}
        <HostQuestion
          question={currentQ}
          questionIndex={questionIndex}
          totalQuestions={totalQuestions}
          timeLeft={timeLeft}
          timer={currentQ.timer}
          answerCount={answerCount}
          totalPlayers={players.length || 1}
          distribution={distribution}
        />
      </>
    );
  }

  if (view === 'results' && currentQ) {
    return (
      <HostResults
        question={currentQ}
        questionIndex={questionIndex}
        totalQuestions={totalQuestions}
        correctAnswer={correctAnswer}
        answerStats={answerStats}
        onNext={handleNext}
        autoIn={autoIn}
      />
    );
  }

  if (view === 'end') {
    return (
      <HostLeaderboard
        leaderboard={leaderboard}
        gameName={gameName}
        pin={pin}
        onPlayAgain={handlePlayAgain}
        onExit={() => navigate('/')}
      />
    );
  }

  return <div className="page"><p className="text-muted">Loading...</p></div>;
}

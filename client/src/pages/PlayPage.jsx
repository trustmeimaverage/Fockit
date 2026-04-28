import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import socket from '../socket';

const ANSWER_COLORS = ['a0', 'a1', 'a2', 'a3'];

// ─── Nickname screen ──────────────────────────────────────────────────────────

function NicknameScreen({ pin, onJoined }) {
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const hasNick = nickname.trim().length > 0;

  function handleJump() {
    if (!hasNick || loading) return;
    setLoading(true);
    setError('');
    socket.emit('game:join', { pin, nickname: nickname.trim() }, (res) => {
      setLoading(false);
      if (res.success) {
        onJoined(nickname.trim(), res.gameName);
      } else {
        setError(res.error || 'Could not join');
      }
    });
  }

  return (
    <div className="page fade-in">
      <div className="page-inner">
        <div className="logo-wrap">
          <span className="logo-text sm">Fockit!</span>
          <span className="logo-tagline">Joining the Game</span>
        </div>

        <p className="label-sm">Come up with your nickname:</p>
        <input
          className="input"
          placeholder="Nickname..."
          value={nickname}
          onChange={e => { setNickname(e.target.value); setError(''); }}
          onKeyDown={e => e.key === 'Enter' && handleJump()}
          maxLength={20}
          autoFocus
        />

        <div className="gap-8" />
        <button
          className={`btn ${hasNick ? 'btn-green' : 'btn-gray'}`}
          disabled={!hasNick || loading}
          onClick={handleJump}
        >
          {loading ? '...' : 'Jump In'}
        </button>

        {error && (
          <p style={{ color: 'var(--a3)', fontSize: 13, fontWeight: 700, marginTop: 8, textAlign: 'center' }}>
            {error}
          </p>
        )}

        <div className="gap-16" />
        <button className="btn btn-dark" onClick={() => window.history.back()}>
          Go Back
        </button>
      </div>
    </div>
  );
}

// ─── Lobby screen ─────────────────────────────────────────────────────────────

function LobbyScreen({ nickname, playerCount, onLeave }) {
  return (
    <div className="page fade-in">
      <div className="page-inner">
        <div className="logo-wrap">
          <span className="logo-text sm">Fockit!</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span className="player-tag">{nickname}</span>
          <span style={{ fontWeight: 900, fontSize: 18, letterSpacing: 2, textTransform: 'uppercase' }}>
            is in lobby!
          </span>
        </div>

        <div className="gap-32" />

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <span className="big-count">{playerCount}</span>
          <span className="section-title">Players Joined</span>
        </div>
        <p className="text-muted" style={{ marginBottom: 40 }}>Waiting for others to join too...</p>

        <button className="btn btn-dark full-width" onClick={onLeave}>
          Leave
        </button>
      </div>
    </div>
  );
}

// ─── Starting countdown ───────────────────────────────────────────────────────

function StartingScreen({ gameName }) {
  const [count, setCount] = useState(5);

  useEffect(() => {
    if (count <= 0) return;
    const t = setTimeout(() => setCount(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [count]);

  if (count <= 0) {
    return (
      <div className="overlay-full fade-in">
        <span className="logo-icon">F!</span>
      </div>
    );
  }

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

function QuizNameScreen({ gameName }) {
  return (
    <div className="overlay-full fade-in">
      <span style={{
        fontFamily: 'var(--font-ui)',
        fontWeight: 900,
        fontSize: 26,
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

// ─── Question screen ──────────────────────────────────────────────────────────

function QuestionScreen({ question, timeLeft, timer, onAnswer, selectedAnswer, accepted }) {
  const urgent = timeLeft <= 5;
  const pct = Math.max(0, timeLeft / timer);
  const isQuiz = question.type === 'quiz';
  const isAnswered = selectedAnswer !== null || accepted;

  if (accepted && !isAnswered) {
    // answered, waiting for reveal
  }

  return (
    <div className="question-page fade-in">
      {/* Timer bar */}
      <div className="timer-bar-wrap">
        <div className={`timer-bar ${urgent ? 'urgent' : ''}`} style={{ width: `${pct * 100}%` }} />
      </div>

      {/* Countdown */}
      <div className={`q-timer ${urgent ? 'urgent' : ''}`}>{timeLeft}</div>

      {/* Question */}
      <div className="q-text">{question.question}</div>

      {/* Answers */}
      {isAnswered ? (
        <p className="accepted-msg">Your answer was accepted!</p>
      ) : isQuiz ? (
        <div className="answer-grid">
          {question.options.map((opt, i) => (
            <button
              key={i}
              className={`answer-btn ${ANSWER_COLORS[i]} ${selectedAnswer === i ? 'selected' : ''}`}
              onClick={() => onAnswer(i)}
              disabled={isAnswered}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : (
        <div className="tf-grid">
          <button
            className={`tf-btn tf-true ${selectedAnswer === 0 ? 'selected' : ''}`}
            onClick={() => onAnswer(0)}
            disabled={isAnswered}
          >✓ True</button>
          <button
            className={`tf-btn tf-false ${selectedAnswer === 1 ? 'selected' : ''}`}
            onClick={() => onAnswer(1)}
            disabled={isAnswered}
          >✗ False</button>
        </div>
      )}
    </div>
  );
}

// ─── Results screen ───────────────────────────────────────────────────────────

function ResultsScreen({ question, correctAnswer, selectedAnswer, timeLeft, isLast, scores, nickname }) {
  const isCorrect = selectedAnswer === correctAnswer;
  const isQuiz = question.type === 'quiz';
  const opts = isQuiz ? question.options : ['True', 'False'];
  const colors = isQuiz ? ANSWER_COLORS : ['a0', 'a3'];

  const myScore = scores[nickname] || 0;

  return (
    <div className="question-page fade-in">
      {/* Correct / wrong badge */}
      {selectedAnswer !== null ? (
        <div className={`result-badge ${isCorrect ? 'correct-badge' : 'wrong-badge'}`}>
          {isCorrect ? '✓ Correct!' : '✗ Wrong!'}
        </div>
      ) : (
        <div className="result-badge wrong-badge">⏱ Time's Up!</div>
      )}

      {/* Question */}
      <div className="q-text" style={{ marginBottom: 20 }}>{question.question}</div>

      {/* Answers with reveal */}
      {isQuiz ? (
        <div className="answer-grid">
          {opts.map((opt, i) => {
            const isCorrectOpt = i === correctAnswer;
            const isSelected = i === selectedAnswer;
            let cls = `answer-btn ${colors[i]}`;
            if (isCorrectOpt) cls += ' correct';
            else if (isSelected) cls += ' wrong';
            else cls += ' dim';
            return (
              <button key={i} className={cls} disabled>
                {opt} {isCorrectOpt ? '✓' : ''}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tf-grid">
          {opts.map((opt, i) => {
            const isCorrectOpt = i === correctAnswer;
            const isSelected = i === selectedAnswer;
            let cls = `tf-btn ${i === 0 ? 'tf-true' : 'tf-false'}`;
            if (isCorrectOpt) cls += ' correct';
            else if (isSelected) cls += ' wrong';
            return (
              <button key={i} className={cls} disabled>
                {opt} {isCorrectOpt ? '✓' : ''}
              </button>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>Your score</p>
        <span className="big-count" style={{ fontSize: 56 }}>{myScore}</span>
      </div>

      <p className="text-muted" style={{ marginTop: 12 }}>
        {isLast ? 'Waiting for final results...' : 'Next question coming up...'}
      </p>
    </div>
  );
}

// ─── Game end screen ──────────────────────────────────────────────────────────

function GameEndScreen({ leaderboard, nickname, onExit }) {
  const myPos = leaderboard.findIndex(e => e.nickname === nickname) + 1;
  const myEntry = leaderboard.find(e => e.nickname === nickname);

  return (
    <div className="page fade-in">
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div className="logo-wrap" style={{ marginBottom: 16 }}>
          <span className="logo-text sm">Fockit!</span>
          <span className="logo-tagline">Game Over</span>
        </div>

        {myEntry && (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--muted)', marginBottom: 4 }}>
              You finished #{myPos}
            </p>
            <span className="big-count">{myEntry.score} pts</span>
          </div>
        )}

        <div className="leaderboard" style={{ marginBottom: 28 }}>
          {leaderboard.slice(0, 10).map((entry, i) => (
            <div
              key={entry.nickname}
              className="lb-row"
              style={{
                borderColor: entry.nickname === nickname ? 'var(--brand)' : 'var(--border)',
                borderWidth: entry.nickname === nickname ? 3 : 2,
              }}
            >
              <span className="lb-rank">{i + 1}</span>
              <span className="lb-name">{entry.nickname}</span>
              <span className="lb-score">{entry.score}</span>
            </div>
          ))}
        </div>

        <p className="text-muted" style={{ marginBottom: 16 }}>Waiting for host to start a new round...</p>
        <button className="btn btn-dark full-width" onClick={onExit}>Exit</button>
      </div>
    </div>
  );
}

// ─── Main PlayPage ────────────────────────────────────────────────────────────

export default function PlayPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const pin = location.state?.pin;

  const [view, setView] = useState('nickname'); // nickname | lobby | starting | quizname | question | results | end
  const [nickname, setNickname] = useState('');
  const [gameName, setGameName] = useState('');
  const [playerCount, setPlayerCount] = useState(0);
  const [currentQ, setCurrentQ] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [endsAt, setEndsAt] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [accepted, setAccepted] = useState(false);
  const [correctAnswer, setCorrectAnswer] = useState(null);
  const [scores, setScores] = useState({});
  const [isLastQuestion, setIsLastQuestion] = useState(false);
  const [leaderboard, setLeaderboard] = useState([]);
  const [hostDisconnectMsg, setHostDisconnectMsg] = useState('');

  const timerRef = useRef(null);
  const nickRef = useRef('');

  // Redirect if no pin
  useEffect(() => {
    if (!pin) navigate('/');
  }, [pin, navigate]);

  // Connect socket
  useEffect(() => {
    if (!socket.connected) socket.connect();

    socket.on('lobby:update', ({ players }) => {
      setPlayerCount(players.length);
    });

    socket.on('game:starting', ({ gameName }) => {
      setGameName(gameName);
      setView('quizname');
      // After 2.5s show countdown
      const t = setTimeout(() => setView('starting'), 2500);
      return () => clearTimeout(t);
    });

    socket.on('question:start', ({ question, type, options, timer, endsAt, questionIndex, totalQuestions }) => {
      setCurrentQ({ question, type, options, timer });
      setQuestionIndex(questionIndex);
      setTotalQuestions(totalQuestions);
      setEndsAt(endsAt);
      setSelectedAnswer(null);
      setAccepted(false);
      setView('question');

      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        const left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
        setTimeLeft(left);
        if (left <= 0) clearInterval(timerRef.current);
      }, 250);
    });

    socket.on('question:end', ({ correctAnswer, scores, isLastQuestion }) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setCorrectAnswer(correctAnswer);
      setScores(scores);
      setIsLastQuestion(isLastQuestion);
      setView('results');
    });

    socket.on('game:end', ({ leaderboard }) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setLeaderboard(leaderboard);
      setView('end');
    });

    socket.on('lobby:reset', ({ players }) => {
      setPlayerCount(players.length);
      setSelectedAnswer(null);
      setAccepted(false);
      setCorrectAnswer(null);
      setLeaderboard([]);
      setView('lobby');
    });

    socket.on('host:disconnected', ({ resumeIn }) => {
      setHostDisconnectMsg(`Host disconnected — game paused for ${resumeIn}s`);
    });
    socket.on('host:reconnected', () => setHostDisconnectMsg(''));
    socket.on('game:terminated', () => {
      alert('The host ended the game.');
      navigate('/');
    });

    return () => {
      socket.off('lobby:update');
      socket.off('game:starting');
      socket.off('question:start');
      socket.off('question:end');
      socket.off('game:end');
      socket.off('lobby:reset');
      socket.off('host:disconnected');
      socket.off('host:reconnected');
      socket.off('game:terminated');
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [navigate]);

  const handleJoined = useCallback((nick, gName) => {
    setNickname(nick);
    nickRef.current = nick;
    setGameName(gName);
    setView('lobby');
  }, []);

  const handleAnswer = useCallback((answerIndex) => {
    if (accepted || selectedAnswer !== null) return;
    setSelectedAnswer(answerIndex);
    socket.emit('answer:submit', { questionIndex, answerIndex }, (res) => {
      if (res.accepted) setAccepted(true);
      else setSelectedAnswer(null); // rejected (time ran out server-side)
    });
  }, [accepted, selectedAnswer, questionIndex]);

  const handleLeave = useCallback(() => {
    socket.emit('game:leave');
    navigate('/');
  }, [navigate]);

  if (!pin) return null;

  return (
    <>
      {hostDisconnectMsg && (
        <div className="disconnect-banner">{hostDisconnectMsg}</div>
      )}

      {view === 'nickname' && (
        <NicknameScreen pin={pin} onJoined={handleJoined} />
      )}
      {view === 'lobby' && (
        <LobbyScreen nickname={nickname} playerCount={playerCount} onLeave={handleLeave} />
      )}
      {view === 'quizname' && (
        <QuizNameScreen gameName={gameName} />
      )}
      {view === 'starting' && (
        <StartingScreen gameName={gameName} />
      )}
      {view === 'question' && currentQ && (
        <QuestionScreen
          question={currentQ}
          timeLeft={timeLeft}
          timer={currentQ.timer}
          onAnswer={handleAnswer}
          selectedAnswer={selectedAnswer}
          accepted={accepted}
        />
      )}
      {view === 'results' && currentQ && (
        <ResultsScreen
          question={currentQ}
          correctAnswer={correctAnswer}
          selectedAnswer={selectedAnswer}
          isLast={isLastQuestion}
          scores={scores}
          nickname={nickname}
        />
      )}
      {view === 'end' && (
        <GameEndScreen
          leaderboard={leaderboard}
          nickname={nickname}
          onExit={handleLeave}
        />
      )}
    </>
  );
}

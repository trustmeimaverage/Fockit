import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const TIMERS = [5, 10, 15, 30];

function emptyQuestion() {
  return { type: 'quiz', question: '', options: ['', '', '', ''], correctIndex: null, correct: null, timer: null };
}

function getQuestionErrors(q) {
  const errors = [];
  if (!q.question.trim()) errors.push('question text is empty');
  if (q.type === 'quiz') {
    const emptyOpts = q.options.filter(o => !o.trim()).length;
    if (emptyOpts > 0) errors.push(`${emptyOpts} answer option${emptyOpts > 1 ? 's' : ''} still empty`);
    if (q.correctIndex === null) errors.push('no correct answer selected (click a circle)');
  } else {
    if (q.correct === null) errors.push('no correct answer selected');
  }
  if (q.timer === null) errors.push('no timer selected');
  return errors;
}

function isQuestionValid(q) {
  return getQuestionErrors(q).length === 0;
}

export default function CreatePage() {
  const navigate = useNavigate();
  const [gameName, setGameName] = useState('');
  const [questions, setQuestions] = useState([emptyQuestion()]);
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState({});

  const allValid = gameName.trim().length > 0 && questions.every(isQuestionValid);

  function touchQ(idx) {
    setTouched(t => ({ ...t, [idx]: true }));
  }

  function setQ(idx, updates) {
    touchQ(idx);
    setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...updates } : q));
  }

  function addQuestion() {
    setQuestions(qs => [...qs, emptyQuestion()]);
    setTimeout(() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' }), 50);
  }

  function removeQuestion(idx) {
    if (questions.length <= 1) return;
    setQuestions(qs => qs.filter((_, i) => i !== idx));
    setTouched(t => {
      const n = { ...t };
      delete n[idx];
      return n;
    });
  }

  function moveUp(idx) {
    if (idx === 0) return;
    setQuestions(qs => {
      const n = [...qs];
      [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]];
      return n;
    });
  }

  function moveDown(idx) {
    if (idx === questions.length - 1) return;
    setQuestions(qs => {
      const n = [...qs];
      [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]];
      return n;
    });
  }

  function handleStartAttempt() {
    if (allValid) {
      handleStart();
      return;
    }
    // Reveal all hints by touching every block
    const all = {};
    questions.forEach((_, i) => { all[i] = true; });
    setTouched(all);
    // Scroll to first incomplete block
    const firstInvalid = questions.findIndex(q => !isQuestionValid(q));
    if (firstInvalid >= 0) {
      setTimeout(() => {
        const el = document.getElementById(`question-block-${firstInvalid}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 50);
    }
  }

  async function handleStart() {
    if (!allValid || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameName: gameName.trim(), questions }),
      });
      const { pin } = await res.json();
      navigate(`/host/${pin}`);
    } catch {
      alert('Failed to create game. Is the server running?');
      setSubmitting(false);
    }
  }

  return (
    <div className="create-page">
      <div className="create-inner">
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <button className="btn btn-dark btn-sm" style={{ width: 80 }} onClick={() => navigate('/')}>
            ← Back
          </button>
          <span className="logo-text xs" style={{ flex: 1 }}>Fockit!</span>
        </div>

        {/* Game name */}
        <div style={{ marginBottom: 24 }}>
          <div className="field-label">Quiz Name</div>
          <input
            className="q-input"
            placeholder="e.g. Linux System Administration"
            value={gameName}
            onChange={e => setGameName(e.target.value)}
          />
        </div>

        {/* Questions */}
        {questions.map((q, idx) => {
          const errors = getQuestionErrors(q);
          const isTouched = !!touched[idx];
          const showErrors = isTouched && errors.length > 0;
          const isValid = errors.length === 0;

          return (
            <div
              key={idx}
              id={`question-block-${idx}`}
              className="question-block"
              style={showErrors ? { borderColor: 'var(--a3)' } : isValid ? { borderColor: 'var(--green)' } : {}}
            >
              {/* Block header */}
              <div className="question-block-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="q-number">Question {idx + 1}</span>
                  {isValid && <span style={{ color: 'var(--green)', fontWeight: 900, fontSize: 15 }}>✓</span>}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                  <div className="q-type-toggle">
                    <button
                      className={`type-pill ${q.type === 'quiz' ? 'active' : ''}`}
                      onClick={() => setQ(idx, { type: 'quiz', correct: null })}
                    >Quiz</button>
                    <button
                      className={`type-pill ${q.type === 'truefalse' ? 'active' : ''}`}
                      onClick={() => setQ(idx, { type: 'truefalse', correctIndex: null })}
                    >True/False</button>
                  </div>
                  <button className="remove-btn" title="Move up" onClick={() => moveUp(idx)}
                    disabled={idx === 0} style={{ opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
                  <button className="remove-btn" title="Move down" onClick={() => moveDown(idx)}
                    disabled={idx === questions.length - 1} style={{ opacity: idx === questions.length - 1 ? 0.3 : 1 }}>↓</button>
                  {questions.length > 1 && (
                    <button className="remove-btn" title="Remove question" onClick={() => removeQuestion(idx)}>✕</button>
                  )}
                </div>
              </div>

              {/* Question text */}
              <textarea
                className="q-input"
                placeholder="Enter your question here..."
                value={q.question}
                onChange={e => setQ(idx, { question: e.target.value })}
                rows={2}
                style={isTouched && !q.question.trim() ? { borderColor: 'var(--a3)' } : {}}
              />

              {/* Answer options */}
              {q.type === 'quiz' ? (
                <>
                  <div className="options-grid">
                    {q.options.map((opt, oi) => {
                      const isEmpty = isTouched && !opt.trim();
                      return (
                        <div className="option-row" key={oi}>
                          <div
                            className={`option-dot ${q.correctIndex === oi ? 'sel' : ''}`}
                            title="Click to mark as correct answer"
                            onClick={() => setQ(idx, { correctIndex: oi })}
                            style={{ cursor: 'pointer' }}
                          />
                          <input
                            className={`option-input opt-${oi}`}
                            placeholder={`Option ${oi + 1}`}
                            value={opt}
                            onChange={e => {
                              const opts = [...q.options];
                              opts[oi] = e.target.value;
                              setQ(idx, { options: opts });
                            }}
                            style={isEmpty ? { borderColor: 'var(--a3)' } : {}}
                          />
                        </div>
                      );
                    })}
                  </div>
                  {isTouched && q.correctIndex === null && (
                    <p style={{ fontSize: 12, color: 'var(--a3)', fontWeight: 700, marginTop: 6 }}>
                      ● Click a circle (○) to mark which answer is correct
                    </p>
                  )}
                </>
              ) : (
                <>
                  <div className="tf-choice">
                    <button
                      className={`tf-radio ${q.correct === true ? 'sel-true' : ''}`}
                      onClick={() => setQ(idx, { correct: true })}
                    >✓ True</button>
                    <button
                      className={`tf-radio ${q.correct === false ? 'sel-false' : ''}`}
                      onClick={() => setQ(idx, { correct: false })}
                    >✗ False</button>
                  </div>
                  {isTouched && q.correct === null && (
                    <p style={{ fontSize: 12, color: 'var(--a3)', fontWeight: 700, marginTop: 6 }}>
                      ● Select the correct answer
                    </p>
                  )}
                </>
              )}

              {/* Timer */}
              <div style={{ marginTop: 12 }}>
                <div
                  className="field-label"
                  style={{
                    marginBottom: 6,
                    color: isTouched && q.timer === null ? 'var(--a3)' : undefined,
                  }}
                >
                  Timer{isTouched && q.timer === null ? ' — pick one ↓' : ''}
                </div>
                <div className="timer-row">
                  {TIMERS.map(t => (
                    <button
                      key={t}
                      className={`timer-pill ${q.timer === t ? 'active' : ''}`}
                      style={isTouched && q.timer === null ? { borderColor: 'var(--a3)', color: 'var(--a3)' } : {}}
                      onClick={() => setQ(idx, { timer: t })}
                    >{t}s</button>
                  ))}
                </div>
              </div>

              {/* Error summary */}
              {showErrors && (
                <div style={{
                  marginTop: 10,
                  padding: '8px 12px',
                  background: '#FEF2F2',
                  borderRadius: 4,
                  borderLeft: '3px solid var(--a3)',
                }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: 'var(--a3)', marginBottom: 2 }}>
                    Still needed:
                  </p>
                  {errors.map(e => (
                    <p key={e} style={{ fontSize: 12, fontWeight: 700, color: 'var(--a3)' }}>· {e}</p>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Add question */}
        <button
          className="btn btn-outline"
          style={{ marginBottom: 16 }}
          onClick={addQuestion}
        >
          + Add Question
        </button>

        {/* Progress summary */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
            {questions.filter(isQuestionValid).length} / {questions.length} questions complete
          </span>
          {!gameName.trim() && (
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--a3)' }}>
              ← quiz name required
            </span>
          )}
        </div>

        {/* Start game button — always pressable so it can show hints */}
        <button
          className={`btn ${allValid ? 'btn-brand' : 'btn-gray'}`}
          disabled={submitting}
          onClick={handleStartAttempt}
          style={{ position: 'sticky', bottom: 16 }}
        >
          {submitting ? 'Creating...' : 'Start Game →'}
        </button>

        {!allValid && (
          <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
            Complete all fields above to start
          </p>
        )}
      </div>
    </div>
  );
}

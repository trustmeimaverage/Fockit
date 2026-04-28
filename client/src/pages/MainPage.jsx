import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function MainPage() {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const hasPin = pin.trim().length > 0;

  async function handleJoin() {
    if (!hasPin) return;
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/games/${pin.trim().toUpperCase()}`);
      if (res.ok) {
        navigate('/play', { state: { pin: pin.trim().toUpperCase() } });
      } else {
        const data = await res.json();
        setError(data.error || 'Game not found');
      }
    } catch {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleJoin();
  }

  return (
    <div className="page">
      <div className="page-inner">
        {/* Logo */}
        <div className="logo-wrap">
          <span className="logo-text">Fockit!</span>
          <span className="logo-tagline">Live Quizzes</span>
        </div>

        {/* Join section */}
        <p className="label-sm">You can join an existing game here:</p>
        <input
          className="input"
          placeholder="Enter Room Code..."
          value={pin}
          onChange={e => { setPin(e.target.value.toUpperCase()); setError(''); }}
          onKeyDown={handleKeyDown}
          maxLength={8}
          autoFocus
        />

        <div className="gap-8" />

        <button
          className={`btn ${hasPin ? 'btn-green' : 'btn-gray'}`}
          onClick={handleJoin}
          disabled={!hasPin || loading}
        >
          {loading ? '...' : 'JOIN'}
        </button>

        {error && (
          <p style={{ color: 'var(--a3)', fontSize: 13, fontWeight: 700, marginTop: 8, textAlign: 'center' }}>
            {error}
          </p>
        )}

        {/* Divider */}
        <div className="gap-32" />
        <p className="label-sm">OR say "Fockit!" and create your own game!</p>

        <button className="btn btn-brand" onClick={() => navigate('/create')}>
          Create
        </button>
      </div>
    </div>
  );
}

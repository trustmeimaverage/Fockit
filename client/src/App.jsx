import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import MainPage from './pages/MainPage.jsx';
import CreatePage from './pages/CreatePage.jsx';
import HostPage from './pages/HostPage.jsx';
import PlayPage from './pages/PlayPage.jsx';

// Grain overlay — matches the subtle paper texture in screenshots
function Grain() {
  return (
    <svg
      style={{
        position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
        pointerEvents: 'none', zIndex: 9999, opacity: 1,
      }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <filter id="grain-filter">
        <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain-filter)" opacity="0.035" />
    </svg>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Grain />
      <Routes>
        <Route path="/" element={<MainPage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/host/:pin" element={<HostPage />} />
        <Route path="/play" element={<PlayPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

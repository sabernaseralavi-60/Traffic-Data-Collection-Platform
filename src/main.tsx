import { createRoot } from 'react-dom/client';
import '@fontsource-variable/vazirmatn';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

// Offline application shell (spec 8, PWA): production only; API responses are never cached.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch((e) => console.warn('service worker:', e)); });
}

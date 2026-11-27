import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    gm_authFailure?: () => void;
    __gmpConsolePatched?: boolean;
  }
}

window.gm_authFailure = () => {
  window.dispatchEvent(
    new CustomEvent('gmp-quota-exceeded', {detail: {reason: 'AuthFailure'}})
  );
};

if (!window.__gmpConsolePatched) {
  window.__gmpConsolePatched = true;
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    origError.apply(console, args);
    const msg = args.map((a) => String(a)).join(' ');
    if (
      msg.includes('OverQuotaMapError') ||
      msg.includes('QuotaExceededError') ||
      msg.includes('RefererNotAllowedMapError')
    ) {
      window.dispatchEvent(
        new CustomEvent('gmp-quota-exceeded', {detail: {reason: msg}})
      );
    }
  };
}

createRoot(document.getElementById('root')!).render(<App />);

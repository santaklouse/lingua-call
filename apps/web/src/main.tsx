import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { KitDemo } from './dev/KitDemo';
import './ui/tokens.css';
import './ui/base.css';

const root = document.getElementById('root');
if (root === null) throw new Error('Root element #root is missing');

const showKit = window.location.hash === '#kit';

createRoot(root).render(
  <StrictMode>{showKit ? <KitDemo /> : <App />}</StrictMode>,
);

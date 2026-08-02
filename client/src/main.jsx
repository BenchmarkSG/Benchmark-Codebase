import React from 'react';
import { createRoot } from 'react-dom/client';
import Root from './Root.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </React.StrictMode>
);

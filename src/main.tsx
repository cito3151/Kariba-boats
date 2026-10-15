import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import App from './App.tsx';
import { AuthProvider } from './data/AuthContext.tsx';
import OperatorAccessProvider from './data/OperatorAccessProvider.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <OperatorAccessProvider>
          <App />
        </OperatorAccessProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);

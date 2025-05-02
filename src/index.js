import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import AdminApp from './App';
import { configureAuthPersistence } from './firebase';

configureAuthPersistence().catch(error => {
  console.error("Falha ao configurar persistência de autenticação:", error);
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <AdminApp />
    </BrowserRouter>
  </React.StrictMode>
);


import React from 'react';
import { createRoot } from 'react-dom/client';

import App from './App';
import StudentNisPortal from './StudentNisPortal';
import SupervisorDashboard from './SupervisorDashboard';

import './style.css';

const portal = new URLSearchParams(
  window.location.search
).get('portal');

function RootApp() {
  switch (portal) {
    case 'pengawas':
      return <SupervisorDashboard />;

    case 'siswa':
      return <StudentNisPortal />;

    default:
      return <App />;
  }
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);

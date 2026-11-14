
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import StudentExam from './StudentExam';
import './style.css';

const isStudentPortal =
  new URLSearchParams(window.location.search)
    .get('portal') === 'siswa';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isStudentPortal ? <StudentExam /> : <App />}
  </React.StrictMode>
);

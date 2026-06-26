import React from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import BoltRounded from '@mui/icons-material/BoltRounded';
import LoginRounded from '@mui/icons-material/LoginRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ChevronRightRounded from '@mui/icons-material/ChevronRightRounded';
import { useAuth } from '../hooks/useAuth.js';

function LandingPage() {
  const navigate = useNavigate();
  const { isLoggedIn } = useAuth();

  if (isLoggedIn) return <Navigate to="/chat" replace />;

  return (
    <div className="landing-page">
      <div className="landing-card">

        <div className="landing-brand-z">Z</div>
        <div className="landing-brand-name">Zuno</div>
        <div className="landing-brand-tag">apni boli mein</div>

        <div className="landing-feat-row">
          <span className="landing-feat">🎓 Bihar Board Class 10</span>
          <span className="landing-feat">💬 Hinglish mein jawab</span>
          <span className="landing-feat">🎯 Focus mode</span>
        </div>

        <p className="landing-desc">
          Jo bhi sawaal ho — seedha poochho.<br />
          Apni boli mein. Bilkul free.
        </p>

        <div className="landing-cta-stack">

          <button className="landing-cta landing-cta-primary" onClick={() => navigate('/register')}>
            <div className="landing-cta-icon">
              <BoltRounded style={{ fontSize: 18 }} />
            </div>
            <div className="landing-cta-body">
              <div className="landing-cta-title">Free account banao</div>
              <div className="landing-cta-sub">Chats save hongi · History milegi · Koi card nahi chahiye</div>
            </div>
            <ArrowForwardRounded className="landing-cta-arrow" style={{ fontSize: 17 }} />
          </button>

          <div className="landing-or-row">
            <div className="landing-or-line" />
            <span className="landing-or-text">pehle se ho?</span>
            <div className="landing-or-line" />
          </div>

          <button className="landing-cta landing-cta-secondary" onClick={() => navigate('/login')}>
            <div className="landing-cta-icon">
              <LoginRounded style={{ fontSize: 18 }} />
            </div>
            <div className="landing-cta-body">
              <div className="landing-cta-title">Wapas aa gaye — login karo</div>
              <div className="landing-cta-sub">Apni purani chats aur progress wahan milegi</div>
            </div>
            <ArrowForwardRounded className="landing-cta-arrow" style={{ fontSize: 17 }} />
          </button>

          <button className="landing-cta landing-cta-ghost" onClick={() => navigate('/chat')}>
            <div className="landing-cta-icon">
              <VisibilityRounded style={{ fontSize: 16 }} />
            </div>
            <div className="landing-cta-body">
              <div className="landing-cta-title">Pehle try karna hai?</div>
              <div className="landing-cta-sub">5 sawaal poochho — account ki zaroorat nahi</div>
            </div>
            <ChevronRightRounded className="landing-cta-arrow" style={{ fontSize: 17 }} />
          </button>

        </div>

        <div className="landing-trust">
          <span>Bihar Board syllabus only</span>
          <span className="landing-trust-sep">·</span>
          <span>Bilkul free</span>
          <span className="landing-trust-sep">·</span>
          <span>Instant access</span>
        </div>

      </div>
    </div>
  );
}

export default LandingPage;

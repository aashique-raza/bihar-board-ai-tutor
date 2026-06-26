import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

export default function GuestOnlyRoute({ children }) {
  const { isLoggedIn } = useAuth();
  if (isLoggedIn) return <Navigate to="/chat" replace />;
  return children;
}

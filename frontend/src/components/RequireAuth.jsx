import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';

// Mirror of GuestOnlyRoute — blocks a page unless the user is logged in.
// Not wired into any route yet: every current page is intentionally open to
// guests too. Ready for whenever a genuinely login-required page is added.
export default function RequireAuth({ children }) {
  const { isLoggedIn } = useAuth();
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  return children;
}

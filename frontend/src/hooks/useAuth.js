import { useSelector } from 'react-redux';
import {
  selectAccessToken,
  selectIsLoading,
  selectIsLoggedIn,
  selectUser,
} from '../store/slices/authSlice.js';

// Convenience hook — components use this instead of calling useSelector directly
export const useAuth = () => {
  const user = useSelector(selectUser);
  const accessToken = useSelector(selectAccessToken);
  const isLoading = useSelector(selectIsLoading);
  const isLoggedIn = useSelector(selectIsLoggedIn);

  return { user, accessToken, isLoading, isLoggedIn };
};

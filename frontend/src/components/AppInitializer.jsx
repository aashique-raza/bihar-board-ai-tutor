import { useEffect } from 'react';
import { useDispatch } from 'react-redux';
import { clearCredentials, setCredentials, setLoading } from '../store/slices/authSlice.js';
import { getMe, refreshAccessToken } from '../services/axios/authService.js';

// Runs once on app load to silently restore the user session using the
// HttpOnly refresh token cookie — no user interaction required.
// Renders nothing; only dispatches to Redux.
function AppInitializer() {
  const dispatch = useDispatch();

  useEffect(() => {
    let isMounted = true;

    const tryRefresh = async () => {
      const data = await refreshAccessToken();
      const newToken = data.data?.accessToken || data.accessToken;
      const userData = await getMe(newToken);
      const user = userData.data;
      return { user, accessToken: newToken };
    };

    const init = async () => {
      try {
        const credentials = await tryRefresh();
        if (isMounted) dispatch(setCredentials(credentials));
      } catch {
        // Wait 500ms and retry once before giving up — handles brief network blips
        await new Promise((res) => setTimeout(res, 500));
        try {
          const credentials = await tryRefresh();
          if (isMounted) dispatch(setCredentials(credentials));
        } catch {
          if (isMounted) dispatch(clearCredentials());
        }
      } finally {
        if (isMounted) dispatch(setLoading(false));
      }
    };

    init();

    return () => { isMounted = false; };
  }, [dispatch]);

  return null;
}

export default AppInitializer;

import { useState, useEffect } from 'react';
import axiosInstance from '../services/axios/axiosInstance.js';

export function useChapterTopics(chapterId) {
  const [topics, setTopics] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!chapterId) {
      setTopics([]);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setError(null);

    axiosInstance.get(`/api/v1/study-map/chapters/${chapterId}/topics`)
      .then((res) => {
        if (isMounted) {
          setTopics(res.data?.data?.topics || []);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || 'Failed to load topics');
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [chapterId]);

  return { topics, isLoading, error };
}

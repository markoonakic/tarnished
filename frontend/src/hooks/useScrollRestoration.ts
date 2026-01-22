import { useLayoutEffect } from 'react';
import { useLocation } from 'react-router-dom';

const scrollPositions = new Map<string, number>();

export function useScrollRestoration() {
  const location = useLocation();

  useLayoutEffect(() => {
    // Save current scroll position when unmounting (navigating away)
    return () => {
      scrollPositions.set(location.key, window.scrollY);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    // Restore scroll position if we've been here before
    const savedPosition = scrollPositions.get(location.key);
    if (savedPosition !== undefined) {
      window.scrollTo(0, savedPosition);
    } else {
      // New route, scroll to top
      window.scrollTo(0, 0);
    }
  }, [location.key]);
}

export function useSaveScrollPosition() {
  const location = useLocation();

  return () => {
    scrollPositions.set(location.key, window.scrollY);
  };
}

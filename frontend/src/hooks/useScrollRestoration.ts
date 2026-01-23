import { useLayoutEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

const scrollPositions = new Map<string, number>();

export function useScrollRestoration() {
  const location = useLocation();
  const previousPath = useRef<string>('');

  useLayoutEffect(() => {
    return () => {
      scrollPositions.set(location.key, window.scrollY);
    };
  }, [location.key]);

  useLayoutEffect(() => {
    const currentPath = location.pathname;
    const isNewRoute = previousPath.current !== currentPath;
    const savedPosition = scrollPositions.get(location.key);

    if (isNewRoute && savedPosition === undefined) {
      window.scrollTo(0, 0);
    } else if (savedPosition !== undefined) {
      window.scrollTo(0, savedPosition);
    }

    previousPath.current = currentPath;
  }, [location.key, location.pathname]);
}

export function useSaveScrollPosition() {
  const location = useLocation();

  return () => {
    scrollPositions.set(location.key, window.scrollY);
  };
}

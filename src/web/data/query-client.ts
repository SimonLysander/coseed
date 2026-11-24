import { QueryClient } from '@tanstack/react-query';
import { HttpError } from './http.js';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, error) => count < 1 && !(error instanceof HttpError && error.status < 500),
      staleTime: 5000,
    },
    mutations: { retry: false },
  },
});

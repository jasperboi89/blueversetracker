import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    // Soft cross-fade between routes via the View Transitions API.
    // Reduced-motion users get instant cuts (guarded in styles.css).
    defaultViewTransition: true,
  });

  return router;
};

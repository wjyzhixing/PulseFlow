import { createMemoryHistory, createRouter, createWebHistory } from 'vue-router';
import { getToken } from './features/auth/auth-store';
import LoginView from './features/auth/LoginView.vue';
import RequirementIntakeView from './features/requirements/RequirementIntakeView.vue';
import DraftReviewView from './features/draft/DraftReviewView.vue';

export function createStudioRouter() {
  const router = createRouter({
    history: typeof window === 'undefined' || import.meta.env.MODE === 'test' ? createMemoryHistory() : createWebHistory(),
    routes: [
      { path: '/', redirect: '/requirements' },
      { path: '/login', component: LoginView },
      { path: '/requirements', component: RequirementIntakeView, meta: { auth: true } },
      { path: '/draft', component: DraftReviewView, meta: { auth: true } },
      { path: '/design', component: () => import('./features/design/DesignStudioView.vue'), meta: { auth: true } }
    ]
  });
  router.beforeEach((to) => {
    if (to.meta.auth && !getToken()) return { path: '/login', query: { next: to.fullPath } };
    if (to.path === '/login' && getToken()) return '/requirements';
  });
  return router;
}

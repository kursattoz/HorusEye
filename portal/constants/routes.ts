// All app routes as constants — never hardcode route strings in components
export const routes = {
  home:            '/',
  docs:            (slug: string) => `/docs/${slug}`,
  login:           '/login',
  dashboard:       '/dashboard',
  files:           '/dashboard/files',
  team:            '/dashboard/team',
  feedback:        '/dashboard/feedback',
  settings:        '/settings',
  notifications:   '/notifications',
  monitor:         '/dev/monitor',
  health:          '/api/health',
  healthDetailed:  '/api/health/detailed',
} as const;

// Routes that require authentication (used in middleware)
export const PROTECTED_ROUTES = [
  '/dashboard',
  '/settings',
  '/notifications',
  '/dev',
] as const;

// Routes only accessible by admin
export const ADMIN_ONLY_ROUTES = [
  '/dashboard/files',
  '/dashboard/team',
  '/dev/monitor',
] as const;

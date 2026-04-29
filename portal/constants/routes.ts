// All app routes as constants — never hardcode route strings in components
export const routes = {
  home:            '/',
  docs:            (slug: string) => `/docs/${slug}`,
  login:           '/login',
  changePassword:  '/change-password',
  dashboard:       '/dashboard',
  files:           '/files',
  filesTrash:      '/files/trash',
  team:            '/team',
  feedback:        '/feedback',
  reports:         '/reports',
  reportDetail:    (id: string) => `/reports/${id}`,
  calendar:        '/calendar',
  sprints:         '/sprints',
  sprintDetail:    (id: string) => `/sprints/${id}`,
  settings:        '/settings',
  notifications:   '/notifications',
  monitor:         '/dev/monitor',
  health:          '/api/health',
  healthDetailed:  '/api/health/detailed',
} as const;

// Routes that require authentication (used in middleware)
export const PROTECTED_ROUTES = [
  '/dashboard',
  '/files',
  '/team',
  '/feedback',
  '/reports',
  '/sprints',
  '/calendar',
  '/settings',
  '/notifications',
  '/dev',
] as const;

// Routes only accessible by admin
export const ADMIN_ONLY_ROUTES = [
  '/files',
  '/files/trash',
  '/team',
  '/dev/monitor',
] as const;

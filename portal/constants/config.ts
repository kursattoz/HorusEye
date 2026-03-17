export const config = {
  env: (process.env.NEXT_PUBLIC_ENV ?? 'local') as 'local' | 'staging' | 'production',
  isDev: process.env.NEXT_PUBLIC_ENV !== 'production',
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  features: {
    cameraModule: process.env.NEXT_PUBLIC_CAMERA_MODULE_ENABLED === 'true',
  },
} as const;

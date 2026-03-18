import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { routes } from '@/constants/routes';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4 p-6 text-center">
      <h1 className="text-8xl font-bold text-muted-foreground/30">404</h1>
      <h2 className="text-xl font-semibold">Page not found</h2>
      <p className="text-muted-foreground max-w-sm">
        The page you're looking for doesn't exist or has been moved.
      </p>
      <Button asChild variant="outline">
        <Link href={routes.home}>Go home</Link>
      </Button>
    </div>
  );
}

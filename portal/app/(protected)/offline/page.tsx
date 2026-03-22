import { WifiOff } from 'lucide-react';

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted mb-6">
        <WifiOff className="h-8 w-8 text-muted-foreground" />
      </div>
      <h1 className="text-2xl font-semibold mb-2">You&apos;re Offline</h1>
      <p className="text-muted-foreground max-w-md">
        This page requires an internet connection. Please check your network and try again.
      </p>
    </div>
  );
}

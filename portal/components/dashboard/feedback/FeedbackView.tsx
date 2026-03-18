'use client';

import { useState, useEffect } from 'react';
import { FileTree, type PublicFile } from '@/components/public/FileTree';
import { Textarea }   from '@/components/ui/textarea';
import { Button }     from '@/components/ui/button';
import { Badge }      from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator }  from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast }      from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { CheckCircle2, Loader2, Globe } from 'lucide-react';

interface FeedbackItem {
  id:            string;
  content:       string;
  feedback_type: string;
  resolved:      boolean;
  is_hidden:     boolean;
  created_at:    string;
  author:        { full_name: string | null; email: string } | null;
}

interface PublicFeedbackItem {
  id:          string;
  author_name: string;
  content:     string;
  created_at:  string;
}

interface FeedbackViewProps {
  files:    PublicFile[];
  userRole: string;
  userId:   string;
}

export function FeedbackView({ files, userRole, userId: _userId }: FeedbackViewProps) {
  const [selectedFile, setSelectedFile]   = useState<PublicFile | null>(null);
  const [feedbacks, setFeedbacks]         = useState<FeedbackItem[]>([]);
  const [pubFeedbacks, setPubFeedbacks]   = useState<PublicFeedbackItem[]>([]);
  const [loading, setLoading]             = useState(false);
  const [pubLoading, setPubLoading]       = useState(false);
  const [content, setContent]             = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [showResolved, setShowResolved]   = useState(false);

  const canWrite = userRole === 'admin' || userRole === 'supervisor';
  const isAdmin  = userRole === 'admin';

  /* eslint-disable react-hooks/set-state-in-effect -- data fetching on dependency change */
  useEffect(() => {
    if (!selectedFile) return;

    let cancelled = false;
    setLoading(true);
    fetch(`/api/feedback?file_id=${selectedFile.id}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setFeedbacks(data.feedbacks ?? []); })
      .catch(() => { if (!cancelled) toast.error('Failed to load comments.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    setPubLoading(true);
    fetch(`/api/public/feedback?file_id=${selectedFile.id}`)
      .then(r => r.json())
      .then(data => { if (!cancelled) setPubFeedbacks(data.feedbacks ?? []); })
      .catch(() => { if (!cancelled) toast.error('Failed to load public feedback.'); })
      .finally(() => { if (!cancelled) setPubLoading(false); });

    return () => { cancelled = true; };
  }, [selectedFile]);
  /* eslint-enable react-hooks/set-state-in-effect */

  async function submitFeedback() {
    if (!selectedFile || !content.trim()) return;
    setSubmitting(true);
    const res = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file_id: selectedFile.id, content: content.trim(), feedback_type: 'general' }),
    });
    if (res.ok) {
      const data = await res.json();
      setFeedbacks(prev => [data.feedback, ...prev]);
      setContent('');
      toast.success('Comment added.');
    } else {
      toast.error('Failed to send comment.');
    }
    setSubmitting(false);
  }

  async function resolveComment(id: string) {
    const res = await fetch(`/api/feedback/${id}/resolve`, { method: 'POST' });
    if (res.ok) {
      setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, resolved: true } : f));
      toast.success('Comment marked as resolved.');
    }
  }

  const visible = feedbacks.filter(f => showResolved ? true : !f.resolved);

  return (
    <div className="flex gap-6 h-[calc(100svh-12rem)]">
      {/* File selector */}
      <div className="w-64 border rounded-lg overflow-hidden shrink-0">
        <FileTree
          files={files}
          selectedId={selectedFile?.id ?? null}
          onSelect={setSelectedFile}
        />
      </div>

      {/* Comment panel */}
      <div className="flex-1 flex flex-col border rounded-lg overflow-hidden">
        {!selectedFile ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            Select a file from the left panel.
          </div>
        ) : (
          <Tabs defaultValue="internal" className="flex flex-col flex-1 overflow-hidden">
            {/* Tab bar + file name */}
            <div className="px-4 pt-3 border-b shrink-0 space-y-2">
              <div className="flex items-center justify-between">
                <p className="font-medium text-sm truncate">{selectedFile.display_name}</p>
                <button
                  onClick={() => setShowResolved(v => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground shrink-0 ml-2"
                >
                  {showResolved ? 'Hide Resolved' : 'Show Resolved'}
                </button>
              </div>
              <TabsList className="h-8">
                <TabsTrigger value="internal" className="text-xs gap-1.5">
                  Internal
                  {feedbacks.length > 0 && (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{feedbacks.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="public" className="text-xs gap-1.5">
                  <Globe size={11} />
                  Public
                  {pubFeedbacks.length > 0 && (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">{pubFeedbacks.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Internal tab */}
            <TabsContent value="internal" className="flex flex-col flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
              <ScrollArea className="flex-1 p-4">
                {loading && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!loading && visible.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-8">No comments yet.</p>
                )}
                <div className="space-y-4">
                  {visible.map(fb => (
                    <div key={fb.id} className="flex gap-3">
                      <Avatar className="h-7 w-7 shrink-0">
                        <AvatarFallback className="text-xs">
                          {(fb.author?.full_name ?? fb.author?.email ?? 'U')[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{fb.author?.full_name ?? fb.author?.email ?? 'User'}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(fb.created_at), { addSuffix: true, locale: enUS })}
                          </span>
                          {fb.resolved && <Badge variant="secondary" className="text-[10px] px-1 py-0">Resolved</Badge>}
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{fb.content}</p>
                        {isAdmin && !fb.resolved && (
                          <button
                            onClick={() => resolveComment(fb.id)}
                            className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                          >
                            <CheckCircle2 size={12} /> Mark as resolved
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <Separator />
              <div className="p-4 space-y-2">
                {canWrite ? (
                  <>
                    <Textarea
                      placeholder="Write a comment… (max 2000 characters)"
                      value={content}
                      onChange={e => setContent(e.target.value.slice(0, 2000))}
                      rows={3}
                      className="resize-none text-sm"
                    />
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-muted-foreground">{content.length}/2000</span>
                      <Button size="sm" onClick={submitFeedback} disabled={!content.trim() || submitting}>
                        {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Submit
                      </Button>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center">
                    Supervisor or admin permission is required to write comments.
                  </p>
                )}
              </div>
            </TabsContent>

            {/* Public feedback tab */}
            <TabsContent value="public" className="flex flex-col flex-1 overflow-hidden mt-0 data-[state=inactive]:hidden">
              <ScrollArea className="flex-1 p-4">
                {pubLoading && (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!pubLoading && pubFeedbacks.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-8">No public feedback yet.</p>
                )}
                <div className="space-y-4">
                  {pubFeedbacks.map(fb => (
                    <div key={fb.id} className="flex gap-3">
                      <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <Globe size={12} className="text-muted-foreground" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{fb.author_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(fb.created_at), { addSuffix: true, locale: enUS })}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1 py-0">Public</Badge>
                        </div>
                        <p className="text-sm whitespace-pre-wrap">{fb.content}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
              <Separator />
              <div className="px-4 py-3">
                <p className="text-xs text-muted-foreground">
                  Public feedback is submitted from the login page by visitors. It is isolated from the internal feedback system.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
}

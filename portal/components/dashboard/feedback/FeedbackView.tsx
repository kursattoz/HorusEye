'use client';

import { useState, useEffect, useMemo } from 'react';
import { FileTree, type PublicFile } from '@/components/public/FileTree';
import { Textarea }   from '@/components/ui/textarea';
import { Button }     from '@/components/ui/button';
import { Badge }      from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator }  from '@/components/ui/separator';
import { toast }      from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { enUS } from 'date-fns/locale';
import { CheckCircle2, Loader2, Globe, EyeOff, RotateCcw } from 'lucide-react';

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

type MergedItem =
  | ({ source: 'internal' } & FeedbackItem)
  | ({ source: 'public'   } & PublicFeedbackItem);

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

  async function toggleResolve(id: string, currentlyResolved: boolean) {
    const res = await fetch(`/api/feedback/${id}/resolve`, { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, resolved: data.resolved } : f));
      toast.success(data.resolved ? 'Comment marked as resolved.' : 'Comment reopened.');
    } else {
      toast.error('Failed to update comment.');
    }
  }

  async function hideComment(id: string) {
    const res = await fetch(`/api/feedback/${id}`, { method: 'DELETE' });
    if (res.ok) {
      setFeedbacks(prev => prev.filter(f => f.id !== id));
      toast.success('Comment hidden.');
    } else {
      toast.error('Failed to hide comment.');
    }
  }

  // Merge both sources into one date-sorted list
  const merged = useMemo<MergedItem[]>(() => {
    const internal = feedbacks
      .filter(f => showResolved || !f.resolved)
      .map(f => ({ source: 'internal' as const, ...f }));
    const pub = pubFeedbacks.map(f => ({ source: 'public' as const, ...f }));
    return [...internal, ...pub].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [feedbacks, pubFeedbacks, showResolved]);

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
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <p className="font-medium text-sm truncate">{selectedFile.display_name}</p>
                {merged.length > 0 && (
                  <Badge variant="secondary" className="px-1.5 py-0 text-[10px] shrink-0">{merged.length}</Badge>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-2">
                {isAdmin && (
                  <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-0.5 rounded font-medium">
                    Admin
                  </span>
                )}
                <button
                  onClick={() => setShowResolved(v => !v)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {showResolved ? 'Hide Resolved' : 'Show Resolved'}
                </button>
              </div>
            </div>

            {/* Merged feed */}
            <ScrollArea className="flex-1 p-4">
              {(loading || pubLoading) && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && !pubLoading && merged.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">No comments yet.</p>
              )}
              <div className="space-y-3">
                {merged.map(item => {
                  if (item.source === 'public') {
                    return (
                      <div key={`pub-${item.id}`} className="flex gap-3 rounded-lg p-3 bg-background">
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <Globe size={12} className="text-muted-foreground" />
                        </div>
                        <div className="flex-1 space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-medium">{item.author_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: enUS })}
                            </span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-400/50 text-amber-600 dark:text-amber-400">
                              Misafir
                            </Badge>
                          </div>
                          <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                        </div>
                      </div>
                    );
                  }

                  // Internal feedback
                  return (
                    <div
                      key={`int-${item.id}`}
                      className={`flex gap-3 rounded-lg p-3 transition-colors ${
                        item.resolved ? 'bg-muted/40 border border-border/50' : 'bg-background'
                      }`}
                    >
                      <Avatar className={`h-7 w-7 shrink-0 ${item.resolved ? 'opacity-60' : ''}`}>
                        <AvatarFallback className="text-xs">
                          {(item.author?.full_name ?? item.author?.email ?? 'U')[0]?.toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 space-y-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-xs font-medium ${item.resolved ? 'text-muted-foreground' : ''}`}>
                            {item.author?.full_name ?? item.author?.email ?? 'User'}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(item.created_at), { addSuffix: true, locale: enUS })}
                          </span>
                          {item.resolved && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1 items-center">
                              <CheckCircle2 size={9} />
                              Resolved
                            </Badge>
                          )}
                        </div>
                        <p className={`text-sm whitespace-pre-wrap ${item.resolved ? 'text-muted-foreground line-through decoration-muted-foreground/40' : ''}`}>
                          {item.content}
                        </p>
                        {isAdmin && (
                          <div className="flex items-center gap-3 pt-1">
                            <button
                              onClick={() => toggleResolve(item.id, item.resolved)}
                              className={`text-xs flex items-center gap-1 transition-colors ${
                                item.resolved
                                  ? 'text-muted-foreground hover:text-amber-600'
                                  : 'text-muted-foreground hover:text-green-600'
                              }`}
                            >
                              {item.resolved
                                ? <><RotateCcw size={11} /> Reopen</>
                                : <><CheckCircle2 size={11} /> Mark as resolved</>}
                            </button>
                            <button
                              onClick={() => hideComment(item.id)}
                              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
                            >
                              <EyeOff size={11} /> Hide
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
          </div>
        )}
      </div>
    </div>
  );
}

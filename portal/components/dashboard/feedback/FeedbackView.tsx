'use client';

import { useState, useEffect } from 'react';
import { FileTree, type PublicFile } from '@/components/public/FileTree';
import { Textarea }   from '@/components/ui/textarea';
import { Button }     from '@/components/ui/button';
import { Badge }      from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator }  from '@/components/ui/separator';
import { toast }      from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { CheckCircle2, Loader2 } from 'lucide-react';

interface FeedbackItem {
  id:            string;
  content:       string;
  feedback_type: string;
  resolved:      boolean;
  is_hidden:     boolean;
  created_at:    string;
  author:        { full_name: string | null; email: string } | null;
}

interface FeedbackViewProps {
  files:    PublicFile[];
  userRole: string;
  userId:   string;
}

export function FeedbackView({ files, userRole, userId }: FeedbackViewProps) {
  const [selectedFile, setSelectedFile]   = useState<PublicFile | null>(null);
  const [feedbacks, setFeedbacks]         = useState<FeedbackItem[]>([]);
  const [loading, setLoading]             = useState(false);
  const [content, setContent]             = useState('');
  const [submitting, setSubmitting]       = useState(false);
  const [showResolved, setShowResolved]   = useState(false);

  const canWrite = userRole === 'admin' || userRole === 'supervisor';
  const isAdmin  = userRole === 'admin';

  useEffect(() => {
    if (!selectedFile) return;
    setLoading(true);
    fetch(`/api/feedback?file_id=${selectedFile.id}`)
      .then(r => r.json())
      .then(data => setFeedbacks(data.feedbacks ?? []))
      .catch(() => toast.error('Yorumlar yüklenemedi.'))
      .finally(() => setLoading(false));
  }, [selectedFile]);

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
      toast.success('Yorum eklendi.');
    } else {
      toast.error('Yorum gönderilemedi.');
    }
    setSubmitting(false);
  }

  async function resolveComment(id: string) {
    const res = await fetch(`/api/feedback/${id}/resolve`, { method: 'POST' });
    if (res.ok) {
      setFeedbacks(prev => prev.map(f => f.id === id ? { ...f, resolved: true } : f));
      toast.success('Yorum çözüldü olarak işaretlendi.');
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
            Sol panelden bir dosya seçin.
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b flex items-center justify-between">
              <p className="font-medium text-sm">{selectedFile.display_name}</p>
              <button
                onClick={() => setShowResolved(v => !v)}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                {showResolved ? 'Çözülenleri Gizle' : 'Çözülenleri Göster'}
              </button>
            </div>

            <ScrollArea className="flex-1 p-4">
              {loading && (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && visible.length === 0 && (
                <p className="text-center text-muted-foreground text-sm py-8">
                  Henüz yorum yok.
                </p>
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
                        <span className="text-xs font-medium">{fb.author?.full_name ?? fb.author?.email ?? 'Kullanıcı'}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(fb.created_at), { addSuffix: true, locale: tr })}
                        </span>
                        {fb.resolved && <Badge variant="secondary" className="text-[10px] px-1 py-0">Çözüldü</Badge>}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{fb.content}</p>
                      {isAdmin && !fb.resolved && (
                        <button
                          onClick={() => resolveComment(fb.id)}
                          className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
                        >
                          <CheckCircle2 size={12} /> Çözüldü işaretle
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <Separator />

            {/* Comment input */}
            <div className="p-4 space-y-2">
              {canWrite ? (
                <>
                  <Textarea
                    placeholder="Yorum yazın... (max 2000 karakter)"
                    value={content}
                    onChange={e => setContent(e.target.value.slice(0, 2000))}
                    rows={3}
                    className="resize-none text-sm"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">{content.length}/2000</span>
                    <Button size="sm" onClick={submitFeedback} disabled={!content.trim() || submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Gönder
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground text-center">
                  Yorum yazmak için supervisor veya admin yetkisi gereklidir.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import dynamic from 'next/dynamic';
import {
  FileText, FileImage, Presentation, Search,
  Download, ExternalLink, BookOpen, ChevronRight,
  MessageSquarePlus, Loader2, Mail, ShieldCheck, X, Send,
} from 'lucide-react';
import { HorusEyeIcon } from '@/components/layout/HorusEyeIcon';
import { cn } from '@/lib/utils';
import type { PublicFile } from '@/components/public/FileTree';

const PdfViewer = dynamic(
  () => import('@/components/public/PdfViewer').then(m => ({ default: m.PdfViewer })),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full">
        <div className="h-6 w-6 rounded-full border-2 border-border border-t-foreground/40 animate-spin" />
      </div>
    ),
  }
);

const FILE_ICONS: Record<string, React.ElementType> = {
  pdf:   FileText,
  pptx:  Presentation,
  docx:  FileText,
  image: FileImage,
};

const FILE_TYPE_COLORS: Record<string, string> = {
  pdf:   'text-red-500',
  pptx:  'text-orange-500',
  docx:  'text-blue-500',
  image: 'text-green-500',
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

interface LoginDocPanelProps {
  files: PublicFile[];
}

// ─── Modal step types ─────────────────────────────────────────────────────────
type OtpStep    = 'idle' | 'email_input' | 'code_input';
type AccessStep = 'idle' | 'email_input' | 'sent';

// ─── Username-only email input row ────────────────────────────────────────────
function TeduEmailInput({
  value,
  onChange,
  autoFocus,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="flex rounded-lg border border-input overflow-hidden focus-within:ring-1 focus-within:ring-ring">
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value.replace(/@.*/, '').trim())}
        placeholder={placeholder ?? 'username'}
        autoFocus={autoFocus}
        autoCapitalize="none"
        autoCorrect="off"
        autoComplete="email"
        inputMode="email"
        className="flex-1 min-w-0 bg-background px-3 py-2.5 text-[16px] md:text-sm text-foreground placeholder:text-muted-foreground outline-none"
      />
      <div className="flex items-center px-3 bg-muted border-l border-input shrink-0">
        <span className="text-xs text-muted-foreground select-none">@tedu.edu.tr</span>
      </div>
    </div>
  );
}

// ─── Spam warning note ────────────────────────────────────────────────────────
function SpamWarning() {
  return (
    <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-md px-3 py-2 leading-relaxed">
      ⚠️ Can&apos;t find the email? Check your <strong>spam</strong> or <strong>junk</strong> folder.
    </p>
  );
}

type FileTypeFilter = 'all' | 'pdf' | 'pptx' | 'other';

const TYPE_TABS: { key: FileTypeFilter; label: string }[] = [
  { key: 'all',   label: 'All'   },
  { key: 'pdf',   label: 'PDF'   },
  { key: 'pptx',  label: 'PPTX'  },
  { key: 'other', label: 'Other' },
];

export function LoginDocPanel({ files }: LoginDocPanelProps) {
  const [selected,    setSelected]    = useState<PublicFile | null>(files[0] ?? null);
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState<FileTypeFilter>('all');
  const [loading,     setLoading]     = useState(false);
  const [fbName,    setFbName]    = useState('');
  const [fbContent, setFbContent] = useState('');
  const [fbSuccess, setFbSuccess] = useState(false);

  // ── OTP state (feedback verification) ──────────────────────────────────────
  const [otpStep,     setOtpStep]     = useState<OtpStep>('idle');
  const [otpUsername, setOtpUsername] = useState(''); // part before @tedu.edu.tr
  const [otpId,       setOtpId]       = useState('');
  const [otpCode,     setOtpCode]     = useState('');
  const [otpLoading,  setOtpLoading]  = useState(false);
  const [otpError,    setOtpError]    = useState('');
  const [pendingFb,   setPendingFb]   = useState<{ name: string; content: string } | null>(null);

  // ── Access link state (open / download gate) ────────────────────────────────
  const [accessStep,     setAccessStep]     = useState<AccessStep>('idle');
  const [accessAction,   setAccessAction]   = useState<'open' | 'download'>('open');
  const [accessUsername, setAccessUsername] = useState('');
  const [accessLoading,  setAccessLoading]  = useState(false);
  const [accessError,    setAccessError]    = useState('');
  const [accessSentTo,   setAccessSentTo]   = useState('');

  const filtered = files.filter(f => {
    if (search && !f.display_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (typeFilter === 'pdf')   return f.file_type === 'pdf';
    if (typeFilter === 'pptx')  return f.file_type === 'pptx';
    if (typeFilter === 'other') return f.file_type !== 'pdf' && f.file_type !== 'pptx';
    return true;
  });

  function handleSelect(file: PublicFile) {
    if (file.id === selected?.id) return;
    setLoading(true);
    setSelected(file);
    setFbSuccess(false);
  }

  // ── Feedback OTP flow ───────────────────────────────────────────────────────
  function handleFbSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    setPendingFb({ name: fbName.trim(), content: fbContent.trim() });
    setOtpStep('email_input');
    setOtpUsername('');
    setOtpError('');
  }

  async function handleSendCode() {
    const username = otpUsername.trim();
    if (!username) {
      setOtpError('Please enter your university username.');
      return;
    }
    const email = `${username}@tedu.edu.tr`;
    setOtpLoading(true);
    setOtpError('');
    try {
      const res  = await fetch('/api/public/feedback/otp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, file_id: selected!.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send code.');
      setOtpId(data.otp_id);
      setOtpCode('');
      setOtpStep('code_input');
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Failed to send code.');
    } finally {
      setOtpLoading(false);
    }
  }

  async function handleVerifyAndSubmit() {
    if (!selected || !pendingFb || otpCode.trim().length !== 6) {
      setOtpError('Please enter the 6-digit code.');
      return;
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      const verifyRes  = await fetch('/api/public/feedback/otp/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ otp_id: otpId, code: otpCode.trim() }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error ?? 'Invalid code.');

      const fbRes  = await fetch('/api/public/feedback', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          file_id:     selected.id,
          author_name: pendingFb.name,
          content:     pendingFb.content,
          otp_id:      otpId,
        }),
      });
      const fbData = await fbRes.json();
      if (!fbRes.ok) throw new Error(fbData.error ?? 'Failed to submit.');

      setFbName('');
      setFbContent('');
      setFbSuccess(true);
      setOtpStep('idle');
      setPendingFb(null);
    } catch (err) {
      setOtpError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setOtpLoading(false);
    }
  }

  function closeOtpModal() {
    setOtpStep('idle');
    setOtpError('');
    setOtpCode('');
  }

  // ── Access link flow ────────────────────────────────────────────────────────
  function handleAccessRequest(action: 'open' | 'download' = 'open') {
    setAccessAction(action);
    setAccessUsername('');
    setAccessError('');
    setAccessStep('email_input');
  }

  async function handleSendAccessLink() {
    const username = accessUsername.trim();
    if (!username) {
      setAccessError('Please enter your university username.');
      return;
    }
    const email = `${username}@tedu.edu.tr`;
    setAccessLoading(true);
    setAccessError('');
    try {
      const res  = await fetch('/api/public/files/access-link', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, file_id: selected!.id, action: accessAction }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to send link.');
      setAccessSentTo(email);
      setAccessStep('sent');
    } catch (err) {
      setAccessError(err instanceof Error ? err.message : 'Failed to send link.');
    } finally {
      setAccessLoading(false);
    }
  }

  function closeAccessModal() {
    setAccessStep('idle');
    setAccessError('');
  }

  const anyModalOpen = otpStep !== 'idle' || accessStep !== 'idle';

  // createPortal requires DOM — only render after mount
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <div className="h-full flex items-center justify-center p-3 md:p-6 lg:p-8 2xl:p-12">

      {/* ── OTP Verification Modal (feedback) ───────────────────────────── */}
      {mounted && otpStep !== 'idle' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) closeOtpModal(); }}
        >
          <div className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90svh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {otpStep === 'email_input'
                    ? <Mail size={16} className="text-primary" />
                    : <ShieldCheck size={16} className="text-primary" />
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Verify Your Identity</p>
                  <p className="text-[11px] text-muted-foreground">
                    {otpStep === 'email_input'
                      ? 'Enter your university email'
                      : `Code sent to ${otpUsername}@tedu.edu.tr`
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={closeOtpModal}
                className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* Step: email input */}
            {otpStep === 'email_input' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Public feedback requires a <strong>@tedu.edu.tr</strong> account.
                  We&apos;ll send a one-time code to verify your submission.
                </p>
                <TeduEmailInput
                  value={otpUsername}
                  onChange={v => { setOtpUsername(v); setOtpError(''); }}
                  autoFocus
                />
                {otpError && <p className="text-xs text-destructive">{otpError}</p>}
                <button
                  onClick={handleSendCode}
                  disabled={otpLoading || !otpUsername.trim()}
                  className="w-full flex items-center justify-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  {otpLoading ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                  Send Verification Code
                </button>
                <SpamWarning />
              </div>
            )}

            {/* Step: code input */}
            {otpStep === 'code_input' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enter the 6-digit code sent to <strong>{otpUsername}@tedu.edu.tr</strong>. It expires in 10 minutes.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={otpCode}
                  onChange={e => { setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setOtpError(''); }}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-[16px] md:text-lg text-center font-mono tracking-[0.4em] text-foreground outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
                {otpError && <p className="text-xs text-destructive">{otpError}</p>}
                <button
                  onClick={handleVerifyAndSubmit}
                  disabled={otpLoading || otpCode.length !== 6}
                  className="w-full flex items-center justify-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  {otpLoading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
                  Verify &amp; Submit Feedback
                </button>
                <SpamWarning />
                <button
                  onClick={() => { setOtpStep('email_input'); setOtpError(''); setOtpCode(''); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1.5"
                >
                  Didn&apos;t receive it? Send again
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ── Access Link Modal (open / download gate) ─────────────────────── */}
      {mounted && accessStep !== 'idle' && createPortal(
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-0 sm:p-4"
          onClick={e => { if (e.target === e.currentTarget) closeAccessModal(); }}
        >
          <div className="w-full sm:max-w-sm bg-card border border-border rounded-t-2xl sm:rounded-xl shadow-2xl p-5 sm:p-6 space-y-4 max-h-[90svh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  {accessStep === 'sent'
                    ? <ShieldCheck size={16} className="text-primary" />
                    : <Mail size={16} className="text-primary" />
                  }
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    {accessStep === 'sent' ? 'Link Sent!' : 'Get Access Link'}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate max-w-[180px]">
                    {accessStep === 'sent'
                      ? accessSentTo
                      : selected?.display_name
                    }
                  </p>
                </div>
              </div>
              <button
                onClick={closeAccessModal}
                className="text-muted-foreground hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-muted"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>

            {/* Step: email input */}
            {accessStep === 'email_input' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Enter your <strong>@tedu.edu.tr</strong> email and we&apos;ll send you a direct link to open or download this document.
                </p>
                <TeduEmailInput
                  value={accessUsername}
                  onChange={v => { setAccessUsername(v); setAccessError(''); }}
                  autoFocus
                />
                {accessError && <p className="text-xs text-destructive">{accessError}</p>}
                <button
                  onClick={handleSendAccessLink}
                  disabled={accessLoading || !accessUsername.trim()}
                  className="w-full flex items-center justify-center gap-1.5 text-sm font-medium bg-primary text-primary-foreground px-4 py-2.5 rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
                >
                  {accessLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  Send Access Link
                </button>
                <SpamWarning />
              </div>
            )}

            {/* Step: sent confirmation */}
            {accessStep === 'sent' && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  We sent a direct access link to <strong>{accessSentTo}</strong>. Open your inbox to view or download the document.
                </p>
                <SpamWarning />
                <button
                  onClick={closeAccessModal}
                  className="w-full flex items-center justify-center gap-1.5 text-sm font-medium bg-muted text-foreground px-4 py-2.5 rounded-lg hover:bg-muted/80 transition-colors min-h-[44px]"
                >
                  Done
                </button>
                <button
                  onClick={() => { setAccessStep('email_input'); setAccessError(''); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors text-center py-1.5"
                >
                  Send to a different address
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Floating card */}
      <div className={cn(
        'w-full max-w-3xl xl:max-w-4xl 2xl:max-w-5xl rounded-2xl overflow-hidden flex flex-col bg-card border border-border shadow-xl',
        // Height: fill available space, scale up for larger / portrait screens
        'h-[min(700px,calc(100svh-3rem))] xl:h-[min(820px,calc(100svh-3rem))] 2xl:h-[min(1000px,calc(100svh-4rem))]',
        // Portrait monitors: maximize vertical space
        'portrait:h-[calc(100svh-3rem)]',
        anyModalOpen && 'blur-[2px] pointer-events-none select-none'
      )}>

        {/* Card header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border shrink-0 bg-muted/40">
          <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center shrink-0">
            <HorusEyeIcon className="w-3.5 h-[11px] text-primary-foreground" />
          </div>
          <span className="text-sm font-semibold text-foreground">Document Hub</span>
          <span className="ml-auto text-xs text-muted-foreground">{files.length} document{files.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Body */}
        <div className="flex flex-col md:flex-row flex-1 overflow-hidden">

          {/* Left — file list */}
          <div className="w-full md:w-56 2xl:w-72 shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-border bg-muted/20 max-h-44 md:max-h-none">
            <div className="p-2.5 border-b border-border space-y-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-md bg-background border border-input pl-8 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <div className="flex gap-1">
                {TYPE_TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setTypeFilter(tab.key)}
                    className={cn(
                      'flex-1 text-[10px] font-medium py-1 rounded transition-colors',
                      typeFilter === tab.key
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {filtered.length === 0 && (
                <p className="text-center text-xs text-muted-foreground py-8">
                  {search ? 'No results found.' : 'No documents yet.'}
                </p>
              )}
              {filtered.map(file => {
                const Icon  = FILE_ICONS[file.file_type] ?? FileText;
                const color = FILE_TYPE_COLORS[file.file_type] ?? 'text-muted-foreground';
                const active = selected?.id === file.id;
                return (
                  <button
                    key={file.id}
                    onClick={() => handleSelect(file)}
                    className={cn(
                      'w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-all group',
                      active
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                    )}
                  >
                    <Icon size={13} className={cn('shrink-0 mt-0.5', active ? color : 'text-muted-foreground/50 group-hover:' + color)} />
                    <div className="min-w-0 flex-1">
                      <p className={cn('truncate font-medium leading-tight', active ? 'text-foreground' : 'text-foreground/70')}>
                        {file.display_name}
                      </p>
                      <p className="text-muted-foreground/60 text-[10px] mt-0.5">{formatDate(file.created_at)}</p>
                    </div>
                    {active && <ChevronRight size={10} className="shrink-0 mt-1 text-muted-foreground" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right — preview */}
          <div className="flex flex-1 flex-col overflow-hidden bg-background/50">
            {selected ? (
              <>
                {/* Preview header */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border shrink-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-foreground truncate">{selected.display_name}</p>
                    {selected.description && (
                      <p className="text-[10px] text-muted-foreground truncate mt-0.5">{selected.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-medium uppercase">
                      {selected.file_type}
                    </span>
                    <button
                      onClick={() => handleAccessRequest('open')}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                    >
                      <ExternalLink size={10} /> Open
                    </button>
                    <button
                      onClick={() => handleAccessRequest('download')}
                      className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-muted"
                    >
                      <Download size={10} /> Download
                    </button>
                  </div>
                </div>

                {/* Viewer */}
                <div className="flex-1 relative overflow-hidden">
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 z-10">
                      <div className="h-6 w-6 rounded-full border-2 border-border border-t-foreground/40 animate-spin" />
                    </div>
                  )}
                  <DocViewer file={selected} onLoad={() => setLoading(false)} onRequestAccess={handleAccessRequest} />
                </div>

                {/* Feedback form */}
                <div className="border-t border-border px-4 py-3 bg-muted/20 shrink-0">
                  <div className="flex items-center gap-1.5 mb-2">
                    <MessageSquarePlus size={12} className="text-muted-foreground" />
                    <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Leave Feedback</p>
                  </div>
                  {fbSuccess ? (
                    <p className="text-xs text-green-600 dark:text-green-400 py-1">
                      Thank you! Your feedback has been submitted.
                    </p>
                  ) : (
                    <form onSubmit={handleFbSubmit} className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Your name *"
                          value={fbName}
                          onChange={e => setFbName(e.target.value.slice(0, 100))}
                          maxLength={100}
                          required
                          className="flex-1 min-w-0 rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                        />
                        <span className="text-[10px] text-muted-foreground self-center">{fbName.length}/100</span>
                      </div>
                      <div>
                        <textarea
                          placeholder="Write your feedback… (10–1000 characters)"
                          value={fbContent}
                          onChange={e => setFbContent(e.target.value.slice(0, 1000))}
                          maxLength={1000}
                          required
                          rows={2}
                          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring resize-none"
                        />
                        <div className="flex justify-between mt-0.5">
                          <span className="text-[10px] text-muted-foreground/60">Plain text only. No HTML or code.</span>
                          <span className="text-[10px] text-muted-foreground">{fbContent.length}/1000</span>
                        </div>
                      </div>
                      <button
                        type="submit"
                        disabled={fbName.trim().length < 2 || fbContent.trim().length < 10}
                        className="flex items-center gap-1.5 text-xs bg-primary text-primary-foreground px-3 py-1.5 rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <ShieldCheck size={11} />
                        Submit Feedback
                      </button>
                    </form>
                  )}
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                <div className="h-12 w-12 rounded-xl bg-muted flex items-center justify-center">
                  <BookOpen size={20} className="text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Select a document</p>
                <p className="text-xs text-muted-foreground/60">Choose a document from the list on the left to preview it.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function DocViewer({
  file,
  onLoad,
  onRequestAccess,
}: {
  file: PublicFile;
  onLoad: () => void;
  onRequestAccess: (action?: 'open' | 'download') => void;
}) {
  const { file_type, public_url, display_name } = file;

  if (file_type === 'pdf') {
    // PdfViewer manages its own loading state internally
    // Call onLoad immediately so the parent loading overlay clears
    if (onLoad) setTimeout(onLoad, 0);
    return <PdfViewer key={public_url} url={public_url} blurredPages={file.blurred_pages} />;
  }

  if (file_type === 'pptx') {
    const viewer = `https://docs.google.com/viewer?url=${encodeURIComponent(public_url)}&embedded=true`;
    return (
      <iframe
        key={public_url}
        src={viewer}
        title={display_name}
        className="w-full h-full border-0"
        onLoad={onLoad}
      />
    );
  }

  if (file_type === 'image') {
    return (
      <div className="flex items-center justify-center h-full p-6" onLoad={onLoad}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={public_url}
          alt={display_name}
          className="max-w-full max-h-full object-contain rounded-lg"
          onLoad={onLoad}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <p className="text-xs text-muted-foreground">This file cannot be previewed in the browser.</p>
      <button
        onClick={() => onRequestAccess('download')}
        className="flex items-center gap-1.5 text-xs bg-muted hover:bg-muted/80 text-foreground px-3 py-1.5 rounded-md transition-colors"
      >
        <Download size={12} /> Get Download Link
      </button>
    </div>
  );
}

'use client';

// BL-209 — Client form for /settings/ai-thresholds.
import { useMemo, useState } from 'react';
import { Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface ThresholdRow {
  key:        string;
  value:      number;
  updated_at: string;
  updated_by: string | null;
}

interface Props {
  initialThresholds: ThresholdRow[];
}

export function AiThresholdsForm({ initialThresholds }: Props) {
  const [rows, setRows]       = useState<ThresholdRow[]>(initialThresholds);
  const [draft, setDraft]     = useState<Record<string, string>>(
    Object.fromEntries(initialThresholds.map(r => [r.key, String(r.value)])),
  );
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<string, ThresholdRow[]>();
    for (const r of rows) {
      const [rule] = r.key.split('.');
      if (!rule) continue;
      const list = map.get(rule);
      if (list) list.push(r);
      else map.set(rule, [r]);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [rows]);

  async function save(key: string) {
    const raw = draft[key];
    const value = Number(raw);
    if (!Number.isFinite(value)) {
      toast.error('Value must be a number');
      return;
    }
    setSavingKey(key);
    try {
      const r = await fetch('/api/settings/ai-thresholds', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key, value }),
      });
      if (!r.ok) {
        const body = await r.json().catch(() => ({}));
        throw new Error(body.error ?? `status ${r.status}`);
      }
      const { threshold } = await r.json();
      setRows(prev => prev.map(p => (p.key === key ? threshold : p)));
      toast.success(`Saved ${key} = ${value}`);
    } catch (err) {
      toast.error(`Save failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="space-y-6">
      {grouped.map(([rule, group]) => (
        <section key={rule} className="rounded-lg border bg-card">
          <header className="border-b px-4 py-2 text-sm font-semibold">
            {rule.replace(/_/g, ' ')}
          </header>
          <div className="divide-y">
            {group.map(r => {
              const knob = r.key.split('.').slice(1).join('.');
              const dirty = draft[r.key] !== String(r.value);
              return (
                <div key={r.key} className="flex items-center gap-3 px-4 py-2">
                  <label htmlFor={r.key} className="flex-1 truncate text-sm" title={r.key}>
                    {knob}
                  </label>
                  <input
                    id={r.key}
                    type="number"
                    step="any"
                    value={draft[r.key] ?? ''}
                    onChange={e => setDraft(d => ({ ...d, [r.key]: e.target.value }))}
                    className="w-32 rounded border bg-background px-2 py-1 text-sm"
                  />
                  <Button
                    size="sm"
                    variant={dirty ? 'default' : 'outline'}
                    disabled={!dirty || savingKey === r.key}
                    onClick={() => save(r.key)}
                  >
                    <Save size={14} className="mr-1" />
                    {savingKey === r.key ? 'Saving…' : 'Save'}
                  </Button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Paperclip, Upload, Trash2, FileText, Image as ImageIcon, Download } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { translate } from '@/lib/i18n';

const BUCKET = 'task-attachments';
const MAX_BYTES = 10 * 1024 * 1024;

// File attachments for a task. Storage bucket is private; we generate signed
// URLs on demand for downloads and image previews. Permissions: anyone who
// can read the parent task can attach; uploader (or room owner via
// canModerate) can delete.
export default function TaskAttachments({ taskId, userId, profiles = {}, canModerate = false, locale = 'ru' }) {
  const t = (k, p) => translate(locale, k, p);
  const supabase = createClient();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [previews, setPreviews] = useState({});
  const fileInputRef = useRef(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('task_attachments')
      .select('id, task_id, uploader_id, filename, size_bytes, mime_type, storage_path, created_at')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    setItems(data || []);
    setLoading(false);
  }, [supabase, taskId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  useEffect(() => {
    const channel = supabase
      .channel(`task-attachments-${taskId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'task_attachments', filter: `task_id=eq.${taskId}` },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [supabase, taskId, load]);

  // Build signed URLs for image previews when the list changes. URLs are
  // 30-min lived which is more than long enough for an open modal.
  useEffect(() => {
    const images = items.filter((it) => /^image\//.test(it.mime_type || ''));
    if (images.length === 0) { setPreviews({}); return; }
    let cancelled = false;
    (async () => {
      const updates = {};
      for (const img of images) {
        const { data } = await supabase.storage.from(BUCKET).createSignedUrl(img.storage_path, 60 * 30);
        if (data?.signedUrl) updates[img.id] = data.signedUrl;
      }
      if (!cancelled) setPreviews(updates);
    })();
    return () => { cancelled = true; };
  }, [items, supabase]);

  const upload = async (file) => {
    if (!file) return;
    setError('');
    if (file.size > MAX_BYTES) {
      setError(t('attachments.tooLarge'));
      return;
    }
    setUploading(true);
    const path = `${taskId}/${crypto.randomUUID()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (upErr) {
      setError(upErr.message);
      setUploading(false);
      return;
    }
    const { error: dbErr } = await supabase.from('task_attachments').insert({
      task_id: taskId,
      uploader_id: userId,
      filename: file.name,
      size_bytes: file.size,
      mime_type: file.type || null,
      storage_path: path,
    });
    setUploading(false);
    if (dbErr) {
      setError(dbErr.message);
      return;
    }
    await load();
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = '';
  };

  const download = async (it) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(it.storage_path, 60);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const del = async (it) => {
    if (!window.confirm(t('attachments.deleteConfirm', { name: it.filename }))) return;
    await supabase.storage.from(BUCKET).remove([it.storage_path]);
    await supabase.from('task_attachments').delete().eq('id', it.id);
    await load();
  };

  const fmtSize = (n) => {
    const isEn = locale === 'en';
    if (n < 1024) return `${n} ${isEn ? 'B' : 'Б'}`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} ${isEn ? 'KB' : 'КБ'}`;
    return `${(n / (1024 * 1024)).toFixed(2)} ${isEn ? 'MB' : 'МБ'}`;
  };

  const localeTag = locale === 'en' ? 'en-US' : 'ru-RU';
  const fmtTime = (iso) => {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    if (sameDay) return d.toLocaleTimeString(localeTag, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(localeTag, { day: 'numeric', month: 'short' });
  };

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-xs font-medium text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
        <Paperclip size={12} /> {t('attachments.heading')}{items.length > 0 ? ` · ${items.length}` : ''}
      </p>
      {!loading && items.length > 0 && (
        <div className="space-y-1.5 mb-2">
          {items.map((it) => {
            const isImage = /^image\//.test(it.mime_type || '');
            const preview = isImage ? previews[it.id] : null;
            const canDelete = it.uploader_id === userId || canModerate;
            return (
              <div key={it.id} className="flex items-start gap-2 p-2 border border-gray-200 rounded-md">
                {preview ? (
                  <img src={preview} alt="" className="w-12 h-12 object-cover rounded border border-gray-200 flex-shrink-0" />
                ) : isImage ? (
                  <ImageIcon size={20} className="mt-1 text-gray-400 flex-shrink-0" />
                ) : (
                  <FileText size={20} className="mt-1 text-gray-400 flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-900 truncate">{it.filename}</p>
                  <p className="text-xs text-gray-500">
                    {fmtSize(it.size_bytes)} · {fmtTime(it.created_at)} · {profiles[it.uploader_id]?.display_name || (locale === 'en' ? 'User' : 'Пользователь')}
                  </p>
                </div>
                <button onClick={() => download(it)} className="text-gray-500 hover:text-gray-900 p-1" title={t('attachments.download')}><Download size={14} /></button>
                {canDelete && (
                  <button onClick={() => del(it)} className="text-gray-400 hover:text-red-600 p-1" title={t('common.delete')}><Trash2 size={14} /></button>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="text-xs px-2.5 py-1 border border-gray-300 rounded-md bg-white hover:bg-gray-50 disabled:opacity-50 inline-flex items-center gap-1"
        >
          <Upload size={12} /> {uploading ? t('attachments.uploading') : t('attachments.button')}
        </button>
        <span className="text-xs text-gray-400">{t('attachments.limit')}</span>
      </div>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </div>
  );
}

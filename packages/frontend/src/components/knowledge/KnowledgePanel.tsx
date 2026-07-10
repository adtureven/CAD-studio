import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  FileText,
  Loader2,
  Search,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useKnowledgeStore,
  type KnowledgeHit,
} from "@/stores/knowledgeStore";

export function KnowledgePanel() {
  const {
    docs,
    loading,
    uploading,
    uploadError,
    lastHits,
    lastQuery,
    refresh,
    upload,
    remove,
    search,
  } = useKnowledgeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
      if (!files || files.length === 0) return;
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".pdf")) continue;
        await upload(file);
      }
    },
    [upload]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      void handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const runSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    try {
      await search(q, 5);
    } finally {
      setSearching(false);
    }
  }, [query, search]);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-3 border-b border-border">
        <h2 className="text-xs font-semibold text-text-secondary uppercase tracking-wider flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5" />
          Knowledge Base
        </h2>
      </div>

      <div className="p-3 space-y-3 overflow-y-auto">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className="cursor-pointer rounded-lg border-2 border-dashed border-border hover:border-primary/40 hover:bg-primary-light/40 transition-colors px-3 py-6 text-center text-xs text-text-secondary"
        >
          <div className="mx-auto mb-2 w-8 h-8 rounded-md bg-cream-dark flex items-center justify-center">
            {uploading ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <Upload className="w-4 h-4 text-primary" />
            )}
          </div>
          <div className="font-medium text-text-primary">
            {uploading ? "上传中…" : "拖拽或点击上传 PDF"}
          </div>
          <div className="mt-0.5">机械设计手册 / 国标 / 论文</div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => {
              void handleFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {uploadError && (
          <div className="rounded-md border border-red-100 bg-red-50 text-red-600 text-xs px-2 py-1.5">
            {uploadError}
          </div>
        )}

        <div>
          <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
            已入库 ({docs.length})
          </div>
          {loading && docs.length === 0 && (
            <div className="text-xs text-text-secondary">加载中…</div>
          )}
          {!loading && docs.length === 0 && (
            <div className="text-xs text-text-secondary">
              暂无文档。上传后 Agent 可通过 search_knowledge 工具引用。
            </div>
          )}
          <div className="space-y-1">
            {docs.map((doc) => (
              <div
                key={doc.doc_id}
                className="group flex items-center gap-2 rounded-md border border-border bg-surface hover:bg-cream-dark px-2 py-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-text-primary truncate">
                    {doc.filename}
                  </div>
                  <div className="text-[10px] text-text-secondary">
                    {doc.pages} 页 · {doc.chunks} chunks
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (confirm(`删除 ${doc.filename}？`)) void remove(doc.doc_id);
                  }}
                  className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-red-50 text-text-secondary hover:text-red-500 transition-all"
                  title="删除"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {docs.length > 0 && (
          <div>
            <div className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider mb-1.5">
              检索测试
            </div>
            <div className="flex gap-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void runSearch();
                }}
                placeholder="例如：模数 3 齿轮许用弯曲应力"
                className="flex-1 rounded-md border border-border bg-surface px-2 py-1 text-xs outline-none focus:border-primary/60"
              />
              <button
                onClick={runSearch}
                disabled={searching || !query.trim()}
                className="px-2 py-1 rounded-md bg-primary text-white text-xs disabled:opacity-40 flex items-center gap-1"
              >
                {searching ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Search className="w-3 h-3" />
                )}
              </button>
            </div>
            {lastHits.length > 0 && (
              <div className="mt-2 space-y-1.5">
                <div className="text-[10px] text-text-secondary">
                  Top {lastHits.length} 匹配 · 查询：{lastQuery}
                </div>
                {lastHits.map((hit) => (
                  <HitCard key={hit.chunk_id} hit={hit} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function HitCard({ hit }: { hit: KnowledgeHit }) {
  const [open, setOpen] = useState(false);
  const preview = hit.text.length > 140 && !open ? hit.text.slice(0, 140) + "…" : hit.text;
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      className="w-full text-left rounded-md border border-border bg-cream px-2 py-1.5 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center justify-between text-[10px] text-text-secondary">
        <span className="truncate">
          {hit.filename} · 第 {hit.page} 页{hit.heading ? ` · ${hit.heading}` : ""}
        </span>
        <span className="font-mono">score {hit.score}</span>
      </div>
      <div className="mt-1 text-[11px] leading-relaxed text-text-primary whitespace-pre-wrap break-words">
        {preview}
      </div>
    </button>
  );
}

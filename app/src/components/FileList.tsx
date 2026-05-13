import { useCallback, useRef, useState } from 'react';
import {
  Folder, FileText, Image, Music, Video, Archive, Code, Database, File,
  ChevronUp, ArrowUpDown,
} from 'lucide-react';
import { useRealFTPStore, formatFileSize } from '@/store/realFTPStore';
import type { FileItem, SortConfig } from '@/types';

interface FileListProps {
  panel: 'local' | 'remote';
}

const FILE_ICONS: Record<string, React.ElementType> = {
  folder: Folder, txt: FileText, md: FileText, pdf: FileText, csv: FileText,
  png: Image, jpg: Image, jpeg: Image, gif: Image, svg: Image, webp: Image,
  mp3: Music, wav: Music, flac: Music, mp4: Video, avi: Video, mkv: Video, mov: Video,
  zip: Archive, rar: Archive, tar: Archive, gz: Archive,
  js: Code, ts: Code, css: Code, html: Code, json: Code, xml: Code,
  db: Database, sqlite: Database,
};

function getFileIcon(item: FileItem): React.ElementType {
  if (item.type === 'directory') return Folder;
  const ext = item.name.split('.').pop()?.toLowerCase() || '';
  return FILE_ICONS[ext] || File;
}

function getFileIconColor(item: FileItem): string {
  if (item.type === 'directory') return '#E3B341';
  const ext = item.name.split('.').pop()?.toLowerCase() || '';
  if (['png','jpg','jpeg','gif','svg','webp'].includes(ext)) return '#3FB950';
  if (['mp3','wav','flac'].includes(ext)) return '#A371F7';
  if (['mp4','avi','mkv','mov'].includes(ext)) return '#F0883E';
  if (['zip','rar','tar','gz'].includes(ext)) return '#F85149';
  if (['js','ts','css','html','json'].includes(ext)) return '#4F8EF7';
  return '#8B949E';
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (date.getFullYear() === now.getFullYear()) return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  return date.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

const COL_HEADER_H = 36;
const ROW_H = 44;

export default function FileList({ panel }: FileListProps) {
  const store = useRealFTPStore();
  const isLocal = panel === 'local';

  const files = isLocal ? store.localFiles : store.remoteFiles;
  const sort = isLocal ? store.localSort : store.remoteSort;
  const selectedFiles = isLocal ? store.selectedLocalFiles : store.selectedRemoteFiles;
  const connectionState = store.connectionState;
  const colWidths = isLocal ? store.localColumnWidths : store.remoteColumnWidths;

  const setSort = isLocal ? store.setLocalSort : store.setRemoteSort;
  const navigate = isLocal ? store.navigateLocal : store.navigateRemote;
  const toggleSelection = isLocal ? store.toggleLocalSelection : store.toggleRemoteSelection;
  const setColumnWidth = store.setColumnWidth;
  const setDraggingColumn = store.setDraggingColumn;

  // Resizing state
  const [resizing, setResizing] = useState<string | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);

  const containerRef = useRef<HTMLDivElement>(null);

  const handleSort = useCallback((key: SortConfig['key']) => {
    const newSort: SortConfig = {
      key,
      direction: sort.key === key && sort.direction === 'asc' ? 'desc' : 'asc',
    };
    setSort(newSort);
  }, [sort, setSort]);

  const handleFileClick = useCallback((item: FileItem) => {
    if (item.type === 'directory') navigate(item.path);
    else toggleSelection(item.id);
  }, [navigate, toggleSelection]);

  const handleFileContextMenu = useCallback((item: FileItem) => {
    store.setActionTargetFile(item);
    store.setActionPanel(panel);
    store.setActionTargetFile(null);
    setTimeout(() => store.setActionTargetFile(item), 50);
  }, [panel, store]);

  // Unified resize handler for both mouse and touch
  const startResize = useCallback((clientX: number, column: 'name' | 'size' | 'date') => {
    setResizing(column);
    setDraggingColumn(column);
    startXRef.current = clientX;
    startWidthRef.current = colWidths[column];

    const handleMove = (currentX: number) => {
      const delta = currentX - startXRef.current;
      setColumnWidth(panel, column, Math.max(40, startWidthRef.current + delta));
    };

    // Mouse handlers
    const handleMouseMove = (ev: MouseEvent) => handleMove(ev.clientX);
    const handleMouseUp = () => cleanup();

    // Touch handlers
    const handleTouchMove = (ev: TouchEvent) => {
      if (ev.touches.length > 0) handleMove(ev.touches[0].clientX);
    };
    const handleTouchEnd = () => cleanup();

    const cleanup = () => {
      setResizing(null);
      setDraggingColumn(null);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleTouchEnd);
      document.removeEventListener('touchcancel', handleTouchEnd);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
    document.addEventListener('touchcancel', handleTouchEnd);
  }, [colWidths, panel, setColumnWidth, setDraggingColumn]);

  const handleMouseDown = useCallback((e: React.MouseEvent, column: 'name' | 'size' | 'date') => {
    e.preventDefault();
    e.stopPropagation();
    startResize(e.clientX, column);
  }, [startResize]);

  const handleTouchStart = useCallback((e: React.TouchEvent, column: 'name' | 'size' | 'date') => {
    e.stopPropagation();
    if (e.touches.length > 0) startResize(e.touches[0].clientX, column);
  }, [startResize]);

  const SortIcon = ({ column }: { column: SortConfig['key'] }) => {
    if (sort.key !== column) return <ArrowUpDown size={12} style={{ color: '#8B949E', opacity: 0.4 }} />;
    return <ChevronUp size={12} style={{ color: '#4F8EF7', transform: sort.direction === 'desc' ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 150ms' }} />;
  };

  // Empty states
  if (!isLocal && connectionState === 'disconnected') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ minHeight: 0 }}>
        <img src="/disconnected.png" alt="Disconnected" className="w-24 h-24 mb-4 opacity-50" style={{ objectFit: 'contain' }} />
        <p className="text-sm mb-3" style={{ color: '#8B949E' }}>未连接到服务器</p>
        <button onClick={() => store.setShowConnectionModal(true)} className="px-4 py-2 text-sm rounded-md transition-colors" style={{ backgroundColor: '#4F8EF7', color: '#FFFFFF' }}>连接服务器</button>
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center" style={{ minHeight: 0 }}>
        <img src="/empty-folder.png" alt="Empty" className="w-24 h-24 mb-4 opacity-40" style={{ objectFit: 'contain' }} />
        <p className="text-sm" style={{ color: '#8B949E' }}>此文件夹为空</p>
      </div>
    );
  }

  const nameWidth = colWidths.name || 200;
  const sizeWidth = colWidths.size;
  const dateWidth = colWidths.date;
  const iconWidth = 40;

  return (
    <div className="flex-1 flex flex-col overflow-hidden" style={{ minHeight: 0 }}>
      {/* Column headers with resize handles */}
      <div
        className="shrink-0 flex items-center select-none"
        style={{ height: COL_HEADER_H, borderBottom: '1px solid #30363D', backgroundColor: '#24282E' }}
      >
        {/* Icon column - fixed width */}
        <div style={{ width: iconWidth, flexShrink: 0 }} />

        {/* Name column */}
        <div
          className="flex items-center gap-1 relative cursor-pointer h-full"
          style={{ width: nameWidth, minWidth: 40, paddingLeft: 4, paddingRight: 4 }}
          onClick={() => handleSort('name')}
        >
          <span className="text-xs truncate" style={{ color: '#8B949E' }}>名称</span>
          <SortIcon column="name" />
          {/* Resize handle - mouse + touch */}
          <div
            className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
            style={{ width: 12, cursor: 'col-resize', zIndex: 10 }}
            onMouseDown={(e) => handleMouseDown(e, 'name')}
            onTouchStart={(e) => handleTouchStart(e, 'name')}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: 2, height: 14, backgroundColor: resizing === 'name' ? '#4F8EF7' : '#30363D', borderRadius: 1 }} />
          </div>
        </div>

        {/* Size column */}
        <div
          className="flex items-center gap-1 relative cursor-pointer h-full"
          style={{ width: sizeWidth, minWidth: 40, paddingLeft: 4, paddingRight: 4 }}
          onClick={() => handleSort('size')}
        >
          <span className="text-xs truncate" style={{ color: '#8B949E' }}>大小</span>
          <SortIcon column="size" />
          <div
            className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
            style={{ width: 12, cursor: 'col-resize', zIndex: 10 }}
            onMouseDown={(e) => handleMouseDown(e, 'size')}
            onTouchStart={(e) => handleTouchStart(e, 'size')}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: 2, height: 14, backgroundColor: resizing === 'size' ? '#4F8EF7' : '#30363D', borderRadius: 1 }} />
          </div>
        </div>

        {/* Date column */}
        <div
          className="flex items-center gap-1 relative cursor-pointer h-full"
          style={{ width: dateWidth, minWidth: 40, paddingLeft: 4, paddingRight: 8 }}
          onClick={() => handleSort('modifiedTime')}
        >
          <span className="text-xs truncate" style={{ color: '#8B949E' }}>修改日期</span>
          <SortIcon column="modifiedTime" />
          <div
            className="absolute right-0 top-0 bottom-0 flex items-center justify-center"
            style={{ width: 12, cursor: 'col-resize', zIndex: 10 }}
            onMouseDown={(e) => handleMouseDown(e, 'date')}
            onTouchStart={(e) => handleTouchStart(e, 'date')}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ width: 2, height: 14, backgroundColor: resizing === 'date' ? '#4F8EF7' : '#30363D', borderRadius: 1 }} />
          </div>
        </div>
      </div>

      {/* File list - with horizontal scroll when columns overflow */}
      <div ref={containerRef} className="flex-1 overflow-auto" style={{ minHeight: 0 }}>
        {files.map((item) => {
          const isSelected = selectedFiles.has(item.id);
          const Icon = getFileIcon(item);
          const iconColor = getFileIconColor(item);
          const isParentDir = item.name === '..';

          return (
            <div
              key={item.id}
              onClick={() => handleFileClick(item)}
              onContextMenu={(e) => { e.preventDefault(); handleFileContextMenu(item); }}
              className="flex items-center cursor-pointer transition-colors select-none"
              style={{
                height: ROW_H,
                backgroundColor: isSelected ? 'rgba(79,142,247,0.12)' : 'transparent',
                borderBottom: '1px solid rgba(48,54,61,0.5)',
              }}
              onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = '#2D333B'; }}
              onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
            >
              {/* Icon */}
              <div style={{ width: iconWidth, flexShrink: 0 }} className="flex items-center justify-center">
                <Icon size={18} style={{ color: iconColor }} />
              </div>

              {/* Name */}
              <div style={{ width: nameWidth, minWidth: 40, paddingLeft: 4, paddingRight: 4 }} className="min-w-0">
                <span className="text-sm truncate block" style={{ color: isParentDir ? '#8B949E' : '#E6EDF3', fontWeight: item.type === 'directory' ? 500 : 400 }}>
                  {item.name}
                </span>
              </div>

              {/* Size */}
              <div style={{ width: sizeWidth, minWidth: 40, paddingLeft: 4, paddingRight: 4 }} className="text-right">
                <span className="text-xs" style={{ color: '#8B949E', fontVariantNumeric: 'tabular-nums' }}>
                  {item.type === 'directory' ? '-' : formatFileSize(item.size)}
                </span>
              </div>

              {/* Date */}
              <div style={{ width: dateWidth, minWidth: 40, paddingLeft: 4, paddingRight: 8 }} className="text-right">
                <span className="text-xs" style={{ color: '#8B949E' }}>
                  {formatDate(item.modifiedTime)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Global resize cursor overlay */}
      {resizing && (
        <style>{`body { cursor: col-resize !important; user-select: none !important; }`}</style>
      )}
    </div>
  );
}

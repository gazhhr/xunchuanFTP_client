import { useState, useEffect } from 'react';
import {
  ArrowUp,
  ArrowDown,
  Edit3,
  Trash2,
  FolderPlus,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useRealFTPStore, formatFileSize, FTPClientNative } from '@/store/realFTPStore';
import { hapticLight } from '@/utils/haptics';
import type { TransferTask } from '@/types';

// 底部操作表 - 文件操作菜单
export function FileActionSheet() {
  const store = useRealFTPStore();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (store.actionTargetFile) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [store.actionTargetFile]);

  if (!visible || !store.actionTargetFile) return null;

  const file = store.actionTargetFile;
  const isLocal = store.actionPanel === 'local';

  const handleUpload = () => {
    if (!file || file.type === 'directory') return;

    const task: TransferTask = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      fileName: file.name,
      fileSize: file.size,
      transferred: 0,
      speed: 0,
      status: 'queued',
      direction: 'upload',
      localPath: file.path,
      remotePath: `${store.remotePath}/${file.name}`.replace(/\/+/g, '/'),
      createdAt: Date.now(),
    };
    store.enqueueTransfer(task);
    store.setActionTargetFile(null);
  };

  const handleDownload = () => {
    if (!file || file.type === 'directory') return;

    const localPath = `${store.localPath}/${file.name}`.replace(/\/+/g, '/');
    const task: TransferTask = {
      id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
      fileName: file.name,
      fileSize: file.size,
      transferred: 0,
      speed: 0,
      status: 'queued',
      direction: 'download',
      localPath,
      remotePath: file.path,
      createdAt: Date.now(),
    };
    store.enqueueTransfer(task);
    store.setActionTargetFile(null);
  };

  const handleRename = () => {
    store.setActionTargetFile(null);
    // Will open rename modal with current file
    setTimeout(() => {
      store.setActionTargetFile(file);
      store.setShowRenameModal(true);
    }, 300);
  };

  const handleDelete = () => {
    store.setShowDeleteConfirm(true);
    store.setActionTargetFile(null);
  };

  return (
    <div className="fixed inset-0 z-40" onClick={() => store.setActionTargetFile(null)}>
      <div className="absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />
      <div
        className="absolute bottom-0 left-0 right-0 rounded-t-lg overflow-hidden"
        style={{ backgroundColor: '#24282E', borderTop: '1px solid #30363D', animation: 'slideUp 250ms ease-out' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* File info header */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid #30363D' }}>
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: '#2D333B' }}>
            {file.type === 'directory' ? (
              <FolderPlus size={20} style={{ color: '#E3B341' }} />
            ) : (
              <Edit3 size={20} style={{ color: '#4F8EF7' }} />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate" style={{ color: '#E6EDF3' }}>{file.name}</p>
            <p className="text-xs" style={{ color: '#8B949E' }}>
              {file.type === 'directory' ? '文件夹' : formatFileSize(file.size)}
            </p>
          </div>
          <button
            onClick={() => store.setActionTargetFile(null)}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: '#8B949E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#30363D')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Actions */}
        <div className="py-1">
          {file.type === 'file' && (
            <>
              {isLocal ? (
                <ActionButton icon={<ArrowUp size={18} />} label="上传到远程服务器" color="#4F8EF7" onClick={handleUpload} />
              ) : (
                <ActionButton icon={<ArrowDown size={18} />} label="下载到本地设备" color="#3FB950" onClick={handleDownload} />
              )}
            </>
          )}
          <ActionButton icon={<Edit3 size={18} />} label="重命名" color="#E6EDF3" onClick={handleRename} />
          <ActionButton icon={<Trash2 size={18} />} label="删除" color="#F85149" danger onClick={handleDelete} />
        </div>
      </div>

      <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
    </div>
  );
}

function ActionButton({ icon, label, color, onClick, danger }: {
  icon: React.ReactNode; label: string; color: string; onClick: () => void; danger?: boolean;
}) {
  const handleClick = () => {
    hapticLight();
    onClick();
  };
  return (
    <button
      onClick={handleClick}
      className="flex items-center gap-3 w-full px-4 py-3 text-sm transition-colors"
      style={{ color }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = danger ? 'rgba(248,81,73,0.1)' : '#2D333B')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
    >
      {icon}{label}
    </button>
  );
}

// 新建文件夹弹窗
export function NewFolderModal() {
  const { showNewFolderModal, setShowNewFolderModal, actionPanel, refreshLocal, refreshRemote, createDirReal } =
    useRealFTPStore();
  const [name, setName] = useState('');

  if (!showNewFolderModal) return null;

  const handleSubmit = async () => {
    if (!name.trim()) return;

    if (actionPanel === 'local') {
      // For local, use native plugin
      try {
        const store = useRealFTPStore.getState();
        await FTPClientNative.createLocalDir({ path: `${store.localPath}/${name.trim()}` });
        await refreshLocal();
      } catch (e: any) {
        console.error('Create local folder error:', e);
      }
    } else {
      // Remote: use FTP
      const success = await createDirReal(name.trim());
      if (success) {
        await refreshRemote();
      }
    }

    setShowNewFolderModal(false);
    setName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-[90%] max-w-[400px] rounded-lg overflow-hidden" style={{ backgroundColor: '#24282E', border: '1px solid #30363D', animation: 'modalSlideIn 200ms ease-out' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #30363D' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#E6EDF3' }}>新建文件夹</h3>
        </div>
        <div className="px-4 py-3">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="文件夹名称"
            autoFocus
            className="w-full h-10 px-3 rounded-md text-sm outline-none transition-colors"
            style={{ backgroundColor: '#2D333B', color: '#E6EDF3', border: '1px solid #30363D' }}
            onFocus={(e) => (e.currentTarget.style.borderColor = '#4F8EF7')}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#30363D')}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
        <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid #30363D' }}>
          <button onClick={() => { setShowNewFolderModal(false); setName(''); }} className="px-4 py-2 text-sm rounded-md transition-colors" style={{ color: '#8B949E' }}>取消</button>
          <button onClick={handleSubmit} className="px-4 py-2 text-sm font-medium rounded-md" style={{ backgroundColor: '#4F8EF7', color: '#FFFFFF' }}>创建</button>
        </div>
      </div>
    </div>
  );
}

// 重命名弹窗
export function RenameModal() {
  const { showRenameModal, setShowRenameModal, actionTargetFile, actionPanel, refreshLocal, refreshRemote, renameFileReal } =
    useRealFTPStore();
  const [name, setName] = useState('');

  useEffect(() => {
    if (actionTargetFile) setName(actionTargetFile.name);
  }, [actionTargetFile]);

  if (!showRenameModal || !actionTargetFile) return null;

  const handleSubmit = async () => {
    if (!name.trim() || name === actionTargetFile.name) {
      setShowRenameModal(false);
      return;
    }

    if (actionPanel === 'local') {
      // Local rename via native plugin
      try {
        const oldPath = actionTargetFile.path;
        const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/';
        const newPath = parentDir === '/' ? `/${name.trim()}` : `${parentDir}/${name.trim()}`;
        await FTPClientNative.renameLocalFile({ oldPath, newPath });
        await refreshLocal();
      } catch (e: any) {
        console.error('Local rename error:', e);
      }
    } else {
      // Remote rename via FTP
      const oldPath = actionTargetFile.path;
      const parentDir = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/';
      const newPath = parentDir === '/' ? `/${name.trim()}` : `${parentDir}/${name.trim()}`;
      const success = await renameFileReal(oldPath, newPath);
      if (success) await refreshRemote();
    }

    setShowRenameModal(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-[90%] max-w-[400px] rounded-lg overflow-hidden" style={{ backgroundColor: '#24282E', border: '1px solid #30363D', animation: 'modalSlideIn 200ms ease-out' }}>
        <div className="px-4 py-3" style={{ borderBottom: '1px solid #30363D' }}>
          <h3 className="text-sm font-semibold" style={{ color: '#E6EDF3' }}>重命名</h3>
        </div>
        <div className="px-4 py-3">
          <input
            type="text" value={name} onChange={(e) => setName(e.target.value)}
            autoFocus className="w-full h-10 px-3 rounded-md text-sm outline-none transition-colors"
            style={{ backgroundColor: '#2D333B', color: '#E6EDF3', border: '1px solid #30363D' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = '#4F8EF7'; e.currentTarget.select(); }}
            onBlur={(e) => (e.currentTarget.style.borderColor = '#30363D')}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          />
        </div>
        <div className="flex justify-end gap-2 px-4 py-3" style={{ borderTop: '1px solid #30363D' }}>
          <button onClick={() => setShowRenameModal(false)} className="px-4 py-2 text-sm rounded-md transition-colors" style={{ color: '#8B949E' }}>取消</button>
          <button onClick={handleSubmit} className="px-4 py-2 text-sm font-medium rounded-md" style={{ backgroundColor: '#4F8EF7', color: '#FFFFFF' }}>确认</button>
        </div>
      </div>
    </div>
  );
}

// 删除确认弹窗
export function DeleteConfirmModal() {
  const { showDeleteConfirm, setShowDeleteConfirm, actionTargetFile, actionPanel, refreshLocal, refreshRemote, deleteFileReal } =
    useRealFTPStore();

  if (!showDeleteConfirm || !actionTargetFile) return null;

  const handleDelete = async () => {
    if (actionPanel === 'local') {
      // Local delete via native plugin
      try {
        await FTPClientNative.deleteLocalFile({
          path: actionTargetFile.path,
          isDirectory: actionTargetFile.type === 'directory',
        });
        await refreshLocal();
      } catch (e: any) {
        console.error('Local delete error:', e);
      }
    } else {
      // Remote delete via FTP
      const success = await deleteFileReal(actionTargetFile.path, actionTargetFile.type === 'directory');
      if (success) await refreshRemote();
    }
    setShowDeleteConfirm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
      <div className="w-[90%] max-w-[360px] rounded-lg overflow-hidden" style={{ backgroundColor: '#24282E', border: '1px solid #30363D', animation: 'modalSlideIn 200ms ease-out' }}>
        <div className="flex flex-col items-center px-4 pt-5 pb-3">
          <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{ backgroundColor: 'rgba(248,81,73,0.15)' }}>
            <AlertTriangle size={24} style={{ color: '#F85149' }} />
          </div>
          <h3 className="text-sm font-semibold mb-1" style={{ color: '#E6EDF3' }}>确认删除</h3>
          <p className="text-xs text-center" style={{ color: '#8B949E' }}>
            此操作不可撤销。确定要删除 &quot;{actionTargetFile.name}&quot; 吗？
          </p>
        </div>
        <div className="flex gap-2 px-4 py-3" style={{ borderTop: '1px solid #30363D' }}>
          <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2.5 text-sm rounded-md transition-colors" style={{ backgroundColor: '#2D333B', color: '#E6EDF3' }}>取消</button>
          <button onClick={handleDelete} className="flex-1 py-2.5 text-sm font-medium rounded-md" style={{ backgroundColor: '#F85149', color: '#FFFFFF' }}>删除</button>
        </div>
      </div>
    </div>
  );
}

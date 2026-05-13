import { useEffect, useState } from 'react';
import {
  FolderOpen,
  RefreshCw,
  Plus,
  ArrowUp,
  ArrowDown,
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  Home,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react';
import { useRealFTPStore } from '@/store/realFTPStore';
import { hapticLight } from '@/utils/haptics';
import ConnectionModal from '@/components/ConnectionModal';
import FileList from '@/components/FileList';
import TransferQueue from '@/components/TransferQueue';
import {
  FileActionSheet,
  NewFolderModal,
  RenameModal,
  DeleteConfirmModal,
} from '@/components/ActionSheet';

// Check if running in Capacitor native
const isNative = () => {
  return typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform();
};

function App() {
  const store = useRealFTPStore();
  const {
    connectionState,
    activeConfig,
    localPath,
    remotePath,
    hasStoragePermission,
    setShowConnectionModal,
    navigateLocal,
    navigateRemote,
    refreshLocal,
    refreshRemote,
    disconnect,
    setShowNewFolderModal,
    setActionPanel,
    checkPermissions,
    initStoragePath,
    loadSavedConfigs,
  } = store;

  const [permissionChecked, setPermissionChecked] = useState(false);

  // Check storage permissions on mount
  useEffect(() => {
    const init = async () => {
      // Load saved connection configs
      await loadSavedConfigs();
      // First init storage path
      await initStoragePath();
      // Then check permissions and load files
      const hasPerm = await checkPermissions();
      setPermissionChecked(true);
      if (hasPerm) {
        try {
          await refreshLocal();
        } catch (e) {
          console.log('Could not load local files');
        }
      }
    };
    init();
  }, []);



  const getStatusInfo = () => {
    switch (connectionState) {
      case 'connected':
        return {
          icon: <Wifi size={14} />,
          color: '#3FB950',
          text: activeConfig ? `${activeConfig.host}:${activeConfig.port}` : '已连接',
        };
      case 'connecting':
        return {
          icon: <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />,
          color: '#E3B341',
          text: '连接中...',
        };
      case 'error':
        return {
          icon: <AlertCircle size={14} />,
          color: '#F85149',
          text: '连接失败',
        };
      default:
        return {
          icon: <WifiOff size={14} />,
          color: '#8B949E',
          text: '未连接',
        };
    }
  };

  const status = getStatusInfo();

  const handleBatchUpload = () => {
    const selectedIds = store.selectedLocalFiles;
    const files = store.localFiles.filter((f) => selectedIds.has(f.id) && f.type === 'file');
    files.forEach((file) => {
      const task = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        fileName: file.name,
        fileSize: file.size,
        transferred: 0,
        speed: 0,
        status: 'queued' as const,
        direction: 'upload' as const,
        localPath: file.path,
        remotePath: `${store.remotePath}/${file.name}`.replace(/\/+/g, '/'),
        createdAt: Date.now(),
      };
      store.enqueueTransfer(task);
    });
    store.clearLocalSelection();
  };

  const handleBatchDownload = () => {
    const selectedIds = store.selectedRemoteFiles;
    const files = store.remoteFiles.filter((f) => selectedIds.has(f.id) && f.type === 'file');
    files.forEach((file) => {
      const localPath = `${store.localPath}/${file.name}`.replace(/\/+/g, '/');
      const task = {
        id: Date.now().toString() + Math.random().toString(36).slice(2, 6),
        fileName: file.name,
        fileSize: file.size,
        transferred: 0,
        speed: 0,
        status: 'queued' as const,
        direction: 'download' as const,
        localPath,
        remotePath: file.path,
        createdAt: Date.now(),
      };
      store.enqueueTransfer(task);
    });
    store.clearRemoteSelection();
  };

  const handleNavigateUp = (panel: 'local' | 'remote') => {
    const currentPath = panel === 'local' ? localPath : remotePath;
    if (currentPath === '/' || currentPath === '' || currentPath === '/storage/emulated/0') return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    const parentPath = parts.length === 0 ? '/' : '/' + parts.join('/');
    if (panel === 'local') {
      navigateLocal(parentPath);
    } else {
      navigateRemote(parentPath);
    }
  };

  return (
    <div
      className="h-screen flex flex-col overflow-hidden select-none"
      style={{
        backgroundColor: '#1A1D21',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans SC", sans-serif',
      }}
    >
      {/* Permission request overlay */}
      {permissionChecked && !hasStoragePermission && isNative() && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(4px)' }}>
          <div
            className="w-[90%] max-w-[380px] rounded-lg p-6"
            style={{ backgroundColor: '#24282E', border: '1px solid #30363D' }}
          >
            <div className="flex flex-col items-center text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-4"
                style={{ backgroundColor: 'rgba(79,142,247,0.15)' }}
              >
                <ShieldAlert size={28} style={{ color: '#4F8EF7' }} />
              </div>
              <h3 className="text-base font-semibold mb-2" style={{ color: '#E6EDF3' }}>
                需要存储权限
              </h3>
              <p className="text-sm mb-5" style={{ color: '#8B949E' }}>
                迅传FTP 需要访问您的设备存储才能浏览本地文件并进行文件传输。请在接下来的系统弹窗中允许此权限。
              </p>
              <p className="text-xs mb-3" style={{ color: '#E3B341' }}>
                对于 Android 11+ 设备，需要前往系统设置开启"所有文件访问权限"
              </p>
              <button
                onClick={() => store.requestPermissions()}
                className="w-full py-3 rounded-md text-sm font-medium transition-all"
                style={{ backgroundColor: '#4F8EF7', color: '#FFFFFF' }}
              >
                前往系统设置开启权限
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ====== HEADER ====== */}
      <header
        className="shrink-0 flex items-center justify-between px-4 h-14"
        style={{ backgroundColor: '#24282E', borderBottom: '1px solid #30363D' }}
      >
        <div className="flex items-center gap-2.5">
          <div className="relative w-7 h-7">
            <svg viewBox="0 0 28 28" className="w-7 h-7">
              <path d="M14 4 L22 10 L22 18 L14 24 L6 18 L6 10 Z" fill="none" stroke="#4F8EF7" strokeWidth="1.5" opacity="0.3" />
              <path d="M14 4 L20 8 L14 12 L8 8 Z" fill="#4F8EF7" opacity="0.8" />
              <path d="M8 8 L8 16 L14 20 L14 12 Z" fill="#3FB950" opacity="0.7" />
              <path d="M20 8 L20 16 L14 20 L14 12 Z" fill="#4F8EF7" opacity="0.6" />
            </svg>
          </div>
          <span className="text-base font-semibold" style={{ color: '#E6EDF3' }}>
            迅传FTP
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              hapticLight();
              if (connectionState === 'connected') {
                disconnect();
              } else {
                setShowConnectionModal(true);
              }
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs transition-all"
            style={{
              backgroundColor: connectionState === 'connected' ? 'rgba(63,185,80,0.15)' : '#2D333B',
              color: status.color,
              border: `1px solid ${connectionState === 'connected' ? 'rgba(63,185,80,0.3)' : '#30363D'}`,
            }}
          >
            {status.icon}
            <span>{status.text}</span>
          </button>

        </div>
      </header>

      {/* ====== TOOLBAR ====== */}
      <div
        className="shrink-0 flex items-center gap-1 px-3 py-1.5"
        style={{ backgroundColor: '#1A1D21', borderBottom: '1px solid #30363D' }}
      >
        <div className="flex-1 flex items-center gap-1">
          <ToolbarButton icon={<Home size={16} />} title="根目录" onClick={() => navigateLocal('/')} />
          <ToolbarButton icon={<ChevronRight size={16} style={{ transform: 'rotate(-90deg)' }} />} title="上级目录" onClick={() => handleNavigateUp('local')} />
          <ToolbarButton icon={<RefreshCw size={16} />} title="刷新" onClick={refreshLocal} />
          <ToolbarButton icon={<Plus size={16} />} title="新建文件夹" onClick={() => { setActionPanel('local'); setShowNewFolderModal(true); }} />
          {store.selectedLocalFiles.size > 0 && (
            <div className="flex items-center gap-1 ml-1">
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#4F8EF7', color: '#FFF' }}>
                {store.selectedLocalFiles.size}
              </span>
              <ToolbarButton icon={<ArrowUp size={16} />} title="上传选中" highlight onClick={handleBatchUpload} />
            </div>
          )}
        </div>

        <div className="flex-1 flex items-center gap-1">
          {store.selectedRemoteFiles.size > 0 && (
            <div className="flex items-center gap-1 mr-1 ml-auto">
              <ToolbarButton icon={<ArrowDown size={16} />} title="下载选中" highlight onClick={handleBatchDownload} />
              <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: '#3FB950', color: '#FFF' }}>
                {store.selectedRemoteFiles.size}
              </span>
            </div>
          )}
          <ToolbarButton icon={<Plus size={16} />} title="新建文件夹" onClick={() => { setActionPanel('remote'); setShowNewFolderModal(true); }} />
          <ToolbarButton icon={<RefreshCw size={16} />} title="刷新" onClick={refreshRemote} />
          <ToolbarButton icon={<ChevronRight size={16} style={{ transform: 'rotate(-90deg)' }} />} title="上级目录" onClick={() => handleNavigateUp('remote')} />
          <ToolbarButton icon={<FolderOpen size={16} />} title="根目录" onClick={() => navigateRemote('/')} />
        </div>
      </div>

      {/* ====== MAIN CONTENT ====== */}
      <div className="flex-1 flex overflow-hidden" style={{ minHeight: 0 }}>
        <div className="flex-1 flex flex-col overflow-hidden" style={{ borderRight: '1px solid #30363D' }}>
          <PathBar label="本地" path={localPath} color="#4F8EF7" />
          <FileList panel="local" />
        </div>
        <div className="flex-1 flex flex-col overflow-hidden">
          <PathBar label="远程" path={remotePath} color="#3FB950" />
          <FileList panel="remote" />
        </div>
      </div>

      <TransferQueue />

      <ConnectionModal />
      <FileActionSheet />
      <NewFolderModal />
      <RenameModal />
      <DeleteConfirmModal />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function ToolbarButton({ icon, title, onClick, highlight }: { icon: React.ReactNode; title: string; onClick: () => void; highlight?: boolean }) {
  const handleClick = () => {
    hapticLight();
    onClick();
  };
  return (
    <button
      onClick={handleClick}
      title={title}
      className="flex items-center justify-center w-8 h-8 rounded-md transition-all"
      style={{
        color: highlight ? '#4F8EF7' : '#8B949E',
        backgroundColor: highlight ? 'rgba(79,142,247,0.12)' : 'transparent',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = highlight ? 'rgba(79,142,247,0.2)' : '#2D333B')}
      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = highlight ? 'rgba(79,142,247,0.12)' : 'transparent')}
    >
      {icon}
    </button>
  );
}

function PathBar({ label, path, color }: { label: string; path: string; color: string }) {
  return (
    <div className="shrink-0 flex items-center gap-2 px-3 h-8" style={{ backgroundColor: '#24282E', borderBottom: '1px solid #30363D' }}>
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ backgroundColor: `${color}20`, color }}>
        {label}
      </span>
      <span className="text-xs truncate flex-1" style={{ color: '#8B949E', fontVariantNumeric: 'tabular-nums' }}>
        {path}
      </span>
    </div>
  );
}

export default App;

import { create } from 'zustand';
import { registerPlugin } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import type { FTPConfig, FileItem, TransferTask, ConnectionState, SortConfig } from '@/types';

const STORAGE_KEY = 'swiftftp_connections';

export const FTPClientNative = registerPlugin<{
  connect(options: { host: string; port: number; username: string; password: string; protocol: string }): Promise<{ success: boolean; currentPath: string }>;
  disconnect(): Promise<{ success: boolean }>;
  isConnected(): Promise<{ connected: boolean; currentPath: string }>;
  getStoragePath(): Promise<{ path: string; downloads: string; documents: string }>;
  checkStoragePermission(): Promise<{ granted: boolean; permission: string; androidVersion: number }>;
  requestStoragePermission(): Promise<{ action: string; message?: string }>;
  listDirectory(options: { path: string }): Promise<{ files: any[]; path: string }>;
  changeDirectory(options: { path: string }): Promise<{ success: boolean; currentPath: string }>;
  downloadFile(options: { remotePath: string; localPath: string }): Promise<{ success: boolean; localPath: string; size: number }>;
  uploadFile(options: { localPath: string; remotePath: string }): Promise<{ success: boolean }>;
  deleteFile(options: { path: string; isDirectory: boolean }): Promise<{ success: boolean }>;
  createDirectory(options: { name: string }): Promise<{ success: boolean }>;
  rename(options: { oldPath: string; newPath: string }): Promise<{ success: boolean }>;
  listLocalDirectory(options: { path: string }): Promise<{ files: any[]; path: string }>;
  createLocalDir(options: { path: string }): Promise<{ success: boolean }>;
  deleteLocalFile(options: { path: string; isDirectory: boolean }): Promise<{ success: boolean }>;
  renameLocalFile(options: { oldPath: string; newPath: string }): Promise<{ success: boolean }>;
}>('FTPClient');

const isNative = () => typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform();

// Browser mock
const generateMockFiles = (path: string): FileItem[] => {
  const dirs = ['documents', 'images', 'videos', 'music', 'projects', 'backup'];
  const files = [
    { name: 'readme.txt', size: 2048 },
    { name: 'data.csv', size: 156000 },
    { name: 'report.pdf', size: 2400000 },
    { name: 'script.js', size: 12400 },
    { name: 'styles.css', size: 8600 },
    { name: 'index.html', size: 4500 },
    { name: 'logo.png', size: 32000 },
    { name: 'archive.zip', size: 15600000 },
  ];
  const result: FileItem[] = [];
  if (path !== '/') {
    result.push({ id: '..', name: '..', type: 'directory', size: 0, modifiedTime: '', permissions: 'drwxr-xr-x', path: path.split('/').slice(0, -1).join('/') || '/' });
  }
  dirs.slice(0, 3).forEach((name, i) => {
    result.push({ id: `dir-${i}`, name, type: 'directory', size: 0, modifiedTime: new Date(Date.now() - Math.random() * 30 * 24 * 3600 * 1000).toISOString(), permissions: 'drwxr-xr-x', path: path === '/' ? `/${name}` : `${path}/${name}` });
  });
  files.slice(0, 4).forEach((f, i) => {
    result.push({ id: `file-${i}`, name: f.name, type: 'file', size: f.size, modifiedTime: new Date(Date.now() - Math.random() * 90 * 24 * 3600 * 1000).toISOString(), permissions: 'rw-r--r--', path: path === '/' ? `/${f.name}` : `${path}/${f.name}` });
  });
  return result;
};

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) { size /= 1024; unitIndex++; }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
};

const sortFiles = (files: FileItem[], sort: SortConfig): FileItem[] => {
  const sorted = [...files];
  sorted.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    if (a.name === '..') return -1;
    if (b.name === '..') return 1;
    let comparison = 0;
    switch (sort.key) {
      case 'name': comparison = a.name.localeCompare(b.name); break;
      case 'size': comparison = a.size - b.size; break;
      case 'modifiedTime': comparison = new Date(a.modifiedTime).getTime() - new Date(b.modifiedTime).getTime(); break;
    }
    return sort.direction === 'asc' ? comparison : -comparison;
  });
  return sorted;
};

interface ColumnWidths {
  name: number;
  size: number;
  date: number;
}

interface FTPState {
  savedConfigs: FTPConfig[];
  activeConfig: FTPConfig | null;
  connectionState: ConnectionState;
  connectionError: string;
  localPath: string;
  localFiles: FileItem[];
  localSort: SortConfig;
  remotePath: string;
  remoteFiles: FileItem[];
  remoteSort: SortConfig;
  selectedLocalFiles: Set<string>;
  selectedRemoteFiles: Set<string>;
  transferTasks: TransferTask[];
  isTransferring: boolean;
  showConnectionModal: boolean;
  showNewFolderModal: boolean;
  showRenameModal: boolean;
  showChmodModal: boolean;
  showDeleteConfirm: boolean;
  actionTargetFile: FileItem | null;
  actionPanel: 'local' | 'remote';
  queueHeight: number;
  activeQueueTab: 'active' | 'history';
  isDraggingQueue: boolean;
  hasStoragePermission: boolean;
  storageBasePath: string;
  // Column widths
  localColumnWidths: ColumnWidths;
  remoteColumnWidths: ColumnWidths;
  draggingColumn: string | null;

  loadSavedConfigs: () => Promise<void>;
  persistConfigs: () => Promise<void>;
  checkPermissions: () => Promise<boolean>;
  requestPermissions: () => Promise<void>;
  initStoragePath: () => Promise<void>;
  setShowConnectionModal: (show: boolean) => void;
  setConnectionError: (error: string) => void;
  connect: (config: FTPConfig) => Promise<void>;
  disconnect: () => void;
  saveConfig: (config: FTPConfig) => void;
  deleteConfig: (id: string) => void;
  toggleLocalSelection: (id: string) => void;
  toggleRemoteSelection: (id: string) => void;
  selectAllLocal: () => void;
  selectAllRemote: () => void;
  clearLocalSelection: () => void;
  clearRemoteSelection: () => void;
  setLocalSort: (sort: SortConfig) => void;
  setRemoteSort: (sort: SortConfig) => void;
  navigateLocal: (path: string) => Promise<void>;
  navigateRemote: (path: string) => Promise<void>;
  refreshLocal: () => Promise<void>;
  refreshRemote: () => Promise<void>;
  addTransferTask: (task: TransferTask) => void;
  updateTransferTask: (id: string, updates: Partial<TransferTask>) => void;
  removeTransferTask: (id: string) => void;
  retryTransferTask: (id: string) => void;
  clearCompletedTasks: () => void;
  // Serial transfer queue
  enqueueTransfer: (task: TransferTask) => void;
  processTransferQueue: () => Promise<void>;
  // Real file operations
  deleteFileReal: (path: string, isDirectory: boolean) => Promise<boolean>;
  renameFileReal: (oldPath: string, newPath: string) => Promise<boolean>;
  createDirReal: (name: string) => Promise<boolean>;
  // Column width
  setColumnWidth: (panel: 'local' | 'remote', column: 'name' | 'size' | 'date', width: number) => void;
  setDraggingColumn: (col: string | null) => void;
  // UI
  setShowNewFolderModal: (show: boolean) => void;
  setShowRenameModal: (show: boolean) => void;
  setShowChmodModal: (show: boolean) => void;
  setShowDeleteConfirm: (show: boolean) => void;
  setActionTargetFile: (file: FileItem | null) => void;
  setActionPanel: (panel: 'local' | 'remote') => void;
  setQueueHeight: (height: number) => void;
  setActiveQueueTab: (tab: 'active' | 'history') => void;
  setIsDraggingQueue: (dragging: boolean) => void;
}

export const useRealFTPStore = create<FTPState>((set, get) => ({
  savedConfigs: [],
  activeConfig: null,
  connectionState: 'disconnected',
  connectionError: '',
  localPath: '/storage/emulated/0',
  localFiles: [],
  localSort: { key: 'name', direction: 'asc' },
  remotePath: '/',
  remoteFiles: [],
  remoteSort: { key: 'name', direction: 'asc' },
  selectedLocalFiles: new Set(),
  selectedRemoteFiles: new Set(),
  transferTasks: [],
  isTransferring: false,
  showConnectionModal: true,
  showNewFolderModal: false,
  showRenameModal: false,
  showChmodModal: false,
  showDeleteConfirm: false,
  actionTargetFile: null,
  actionPanel: 'local',
  queueHeight: 220,
  activeQueueTab: 'active',
  isDraggingQueue: false,
  hasStoragePermission: false,
  storageBasePath: '/storage/emulated/0',
  localColumnWidths: { name: 0, size: 80, date: 110 },
  remoteColumnWidths: { name: 0, size: 80, date: 110 },
  draggingColumn: null,

  loadSavedConfigs: async () => {
    try {
      const { value } = await Preferences.get({ key: STORAGE_KEY });
      if (value) { set({ savedConfigs: JSON.parse(value) }); }
    } catch (e) { console.error('Failed to load saved configs:', e); }
  },

  persistConfigs: async () => {
    try { await Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(get().savedConfigs) }); }
    catch (e) { console.error('Failed to persist configs:', e); }
  },

  checkPermissions: async () => {
    if (!isNative()) { set({ hasStoragePermission: true }); return true; }
    try { const result = await FTPClientNative.checkStoragePermission(); set({ hasStoragePermission: result.granted }); return result.granted; }
    catch (e) { set({ hasStoragePermission: false }); return false; }
  },

  requestPermissions: async () => {
    if (!isNative()) return;
    try { await FTPClientNative.requestStoragePermission(); } catch (e) { console.error('Failed to request permission:', e); }
  },

  initStoragePath: async () => {
    if (!isNative()) return;
    try { const result = await FTPClientNative.getStoragePath(); set({ storageBasePath: result.path, localPath: result.path }); } catch (e) { console.log('Using default storage path'); }
  },

  setShowConnectionModal: (show) => set({ showConnectionModal: show }),
  setConnectionError: (error) => set({ connectionError: error }),

  connect: async (config) => {
    set({ connectionState: 'connecting', connectionError: '' });
    try {
      const result = await FTPClientNative.connect({ host: config.host, port: config.port, username: config.username, password: config.password, protocol: config.protocol });
      if (result.success) {
        set({ connectionState: 'connected', activeConfig: config, showConnectionModal: false, remotePath: result.currentPath || '/' });
        await get().refreshRemote();
      } else { set({ connectionState: 'error', connectionError: 'Connection failed' }); }
    } catch (error: any) { set({ connectionState: 'error', connectionError: error?.message || 'Failed to connect to FTP server' }); }
  },

  disconnect: async () => {
    try { await FTPClientNative.disconnect(); } catch (e) {}
    set({ connectionState: 'disconnected', activeConfig: null, remoteFiles: [], remotePath: '/', selectedRemoteFiles: new Set() });
  },

  saveConfig: (config) => {
    const configs = [...get().savedConfigs];
    const existing = configs.findIndex((c) => c.id === config.id);
    if (existing >= 0) configs[existing] = config; else configs.push(config);
    set({ savedConfigs: configs });
    Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(configs) }).catch(() => {});
  },

  deleteConfig: (id) => {
    const configs = get().savedConfigs.filter((c) => c.id !== id);
    set({ savedConfigs: configs });
    Preferences.set({ key: STORAGE_KEY, value: JSON.stringify(configs) }).catch(() => {});
  },

  toggleLocalSelection: (id) => { const s = new Set(get().selectedLocalFiles); s.has(id) ? s.delete(id) : s.add(id); set({ selectedLocalFiles: s }); },
  toggleRemoteSelection: (id) => { const s = new Set(get().selectedRemoteFiles); s.has(id) ? s.delete(id) : s.add(id); set({ selectedRemoteFiles: s }); },
  selectAllLocal: () => set({ selectedLocalFiles: new Set(get().localFiles.filter(f => f.name !== '..').map(f => f.id)) }),
  selectAllRemote: () => set({ selectedRemoteFiles: new Set(get().remoteFiles.filter(f => f.name !== '..').map(f => f.id)) }),
  clearLocalSelection: () => set({ selectedLocalFiles: new Set() }),
  clearRemoteSelection: () => set({ selectedRemoteFiles: new Set() }),

  setLocalSort: (sort) => set({ localSort: sort, localFiles: sortFiles(get().localFiles, sort) }),
  setRemoteSort: (sort) => set({ remoteSort: sort, remoteFiles: sortFiles(get().remoteFiles, sort) }),

  navigateLocal: async (path) => { set({ localPath: path, selectedLocalFiles: new Set() }); await get().refreshLocal(); },
  navigateRemote: async (path) => {
    if (get().connectionState !== 'connected') return;
    try { const result = await FTPClientNative.changeDirectory({ path }); if (result.success) { set({ remotePath: result.currentPath || path, selectedRemoteFiles: new Set() }); await get().refreshRemote(); } }
    catch (error: any) { set({ connectionError: error?.message || 'Failed to navigate' }); }
  },

  refreshLocal: async () => {
    if (isNative()) {
      try {
        const result = await FTPClientNative.listLocalDirectory({ path: get().localPath });
        const files: FileItem[] = result.files.map((f: any, i: number) => ({
          id: `local-${f.name}-${i}`, name: f.name, type: f.type || 'file', size: f.size || 0, modifiedTime: f.modifiedTime || '',
          permissions: f.permissions || 'rw-r--r--', path: f.path || `${get().localPath}/${f.name}`,
        }));
        set({ localFiles: sortFiles(files, get().localSort) });
      } catch (error: any) { console.error('Failed to read local directory:', error); set({ localFiles: [] }); }
    } else { set({ localFiles: sortFiles(generateMockFiles(get().localPath), get().localSort) }); }
  },

  refreshRemote: async () => {
    if (get().connectionState !== 'connected') return;
    try {
      const result = await FTPClientNative.listDirectory({ path: get().remotePath });
      const files: FileItem[] = result.files.map((f: any, i: number) => ({
        id: `remote-${f.name}-${i}`, name: f.name, type: f.type || 'file', size: f.size || 0, modifiedTime: f.modifiedTime || '',
        permissions: f.permissions || 'rw-r--r--', path: f.path || `${get().remotePath}/${f.name}`,
      }));
      set({ remoteFiles: sortFiles(files, get().remoteSort) });
    } catch (error: any) { set({ connectionError: error?.message || 'Failed to list remote directory' }); }
  },

  addTransferTask: (task) => set({ transferTasks: [...get().transferTasks, task] }),
  updateTransferTask: (id, updates) => set({ transferTasks: get().transferTasks.map(t => t.id === id ? { ...t, ...updates } : t) }),
  removeTransferTask: (id) => set({ transferTasks: get().transferTasks.filter(t => t.id !== id) }),
  retryTransferTask: (id) => {
    set({ transferTasks: get().transferTasks.map(t => t.id === id ? { ...t, status: 'queued' as const, transferred: 0, error: undefined } : t) });
    get().processTransferQueue();
  },
  clearCompletedTasks: () => set({ transferTasks: get().transferTasks.filter(t => t.status !== 'completed' && t.status !== 'failed') }),

  // SERIAL transfer queue - FTP doesn't support concurrent transfers
  enqueueTransfer: (task: TransferTask) => {
    set({ transferTasks: [...get().transferTasks, task] });
    get().processTransferQueue();
  },

  processTransferQueue: async () => {
    if (get().isTransferring) return; // Already processing
    set({ isTransferring: true });

    while (true) {
      const tasks = get().transferTasks;
      const nextTask = tasks.find(t => t.status === 'queued');
      if (!nextTask) break; // No more queued tasks

      // Mark as active
      set({ transferTasks: tasks.map(t => t.id === nextTask.id ? { ...t, status: 'active' as const } : t) });

      // Simulate progress
      const totalSize = nextTask.fileSize;
      let transferred = 0;
      const progressInterval = setInterval(() => {
        transferred += totalSize / 30 || 50000;
        const progress = Math.min(transferred, totalSize * 0.95);
        get().updateTransferTask(nextTask.id, { transferred: progress, speed: 300 + Math.random() * 2000 });
      }, 400);

      let success = false;
      try {
        if (nextTask.direction === 'download') {
          const absLocal = nextTask.localPath.startsWith('/') ? nextTask.localPath : `${get().storageBasePath}/${nextTask.localPath}`;
          const result = await FTPClientNative.downloadFile({ remotePath: nextTask.remotePath, localPath: absLocal });
          success = result.success;
        } else {
          const absLocal = nextTask.localPath.startsWith('/') ? nextTask.localPath : `${get().storageBasePath}/${nextTask.localPath}`;
          const result = await FTPClientNative.uploadFile({ localPath: absLocal, remotePath: nextTask.remotePath });
          success = result.success;
        }
      } catch (e: any) {
        console.error('Transfer error:', e);
        success = false;
      }

      clearInterval(progressInterval);

      if (success) {
        set({ transferTasks: get().transferTasks.map(t => t.id === nextTask.id ? { ...t, status: 'completed' as const, transferred: totalSize, speed: 0, completedAt: Date.now() } : t) });
        // Refresh file list
        if (nextTask.direction === 'download') await get().refreshLocal(); else await get().refreshRemote();
      } else {
        set({ transferTasks: get().transferTasks.map(t => t.id === nextTask.id ? { ...t, status: 'failed' as const, error: 'Transfer failed', speed: 0 } : t) });
      }
    }

    set({ isTransferring: false });
  },

  deleteFileReal: async (path, isDirectory) => { try { return (await FTPClientNative.deleteFile({ path, isDirectory })).success; } catch { return false; } },
  renameFileReal: async (oldPath, newPath) => { try { return (await FTPClientNative.rename({ oldPath, newPath })).success; } catch { return false; } },
  createDirReal: async (name) => { try { return (await FTPClientNative.createDirectory({ name })).success; } catch { return false; } },

  setColumnWidth: (panel, column, width) => {
    const key = panel === 'local' ? 'localColumnWidths' : 'remoteColumnWidths';
    const widths = { ...get()[key], [column]: Math.max(40, width) };
    set({ [key]: widths } as Partial<FTPState>);
  },
  setDraggingColumn: (col) => set({ draggingColumn: col }),

  setShowNewFolderModal: (show) => set({ showNewFolderModal: show }),
  setShowRenameModal: (show) => set({ showRenameModal: show }),
  setShowChmodModal: (show) => set({ showChmodModal: show }),
  setShowDeleteConfirm: (show) => set({ showDeleteConfirm: show }),
  setActionTargetFile: (file) => set({ actionTargetFile: file }),
  setActionPanel: (panel) => set({ actionPanel: panel }),
  setQueueHeight: (height) => set({ queueHeight: Math.max(50, Math.min(400, height)) }),
  setActiveQueueTab: (tab) => set({ activeQueueTab: tab }),
  setIsDraggingQueue: (dragging) => set({ isDraggingQueue: dragging }),
}));

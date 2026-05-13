// FTP 连接配置
export interface FTPConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'ftp' | 'ftps' | 'sftp';
  username: string;
  password: string;
}

// 文件/目录项
export interface FileItem {
  id: string;
  name: string;
  type: 'file' | 'directory';
  size: number;
  modifiedTime: string;
  permissions: string;
  path: string;
}

// 传输任务状态
export type TransferStatus = 'queued' | 'active' | 'completed' | 'failed' | 'paused';

// 传输任务
export interface TransferTask {
  id: string;
  fileName: string;
  fileSize: number;
  transferred: number;
  speed: number; // KB/s
  status: TransferStatus;
  direction: 'upload' | 'download';
  localPath: string;
  remotePath: string;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

// 连接状态
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

// 排序配置
export interface SortConfig {
  key: 'name' | 'size' | 'modifiedTime';
  direction: 'asc' | 'desc';
}

// 面板类型
export type PanelType = 'local' | 'remote';

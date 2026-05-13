import { useState } from 'react';
import { X, Server, Plug, ChevronDown, Save, Trash2 } from 'lucide-react';
import { useRealFTPStore } from '@/store/realFTPStore';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import type { FTPConfig } from '@/types';

export default function ConnectionModal() {
  const {
    showConnectionModal,
    savedConfigs,
    connectionState,
    connectionError,
    connect,
    saveConfig,
    deleteConfig,
    setShowConnectionModal,
    setConnectionError,
  } = useRealFTPStore();

  const [form, setForm] = useState<FTPConfig>({
    id: '',
    name: '',
    host: '',
    port: 21,
    protocol: 'ftp',
    username: '',
    password: '',
  });
  const [showSaved, setShowSaved] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!showConnectionModal) return null;

  const handleConnect = async () => {
    hapticMedium();
    if (!form.host.trim()) {
      setConnectionError('请输入服务器地址');
      return;
    }
    const config: FTPConfig = {
      ...form,
      id: form.id || Date.now().toString(),
    };
    if (!form.id) {
      setForm((prev) => ({ ...prev, id: config.id }));
    }
    await connect(config);
  };

  const handleSave = () => {
    hapticLight();
    if (!form.host.trim() || !form.name.trim()) return;
    const config: FTPConfig = {
      ...form,
      id: form.id || Date.now().toString(),
    };
    saveConfig(config);
    setForm((prev) => ({ ...prev, id: config.id }));
  };

  const handleLoadConfig = (config: FTPConfig) => {
    setForm(config);
    setShowSaved(false);
    setConnectionError('');
  };

  const handleDeleteConfig = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteConfig(id);
    if (form.id === id) {
      setForm({
        id: '',
        name: '',
        host: '',
        port: 21,
        protocol: 'ftp',
        username: '',
        password: '',
      });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div
        className="w-[90%] max-w-[500px] rounded-lg overflow-hidden"
        style={{
          backgroundColor: '#24282E',
          border: '1px solid #30363D',
          animation: 'modalSlideIn 200ms ease-out',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid #30363D' }}>
          <div className="flex items-center gap-2.5">
            <Server size={20} style={{ color: '#4F8EF7' }} />
            <h2 className="text-lg font-semibold" style={{ color: '#E6EDF3' }}>
              新建站点连接
            </h2>
          </div>
          <button
            onClick={() => setShowConnectionModal(false)}
            className="p-1 rounded-md transition-colors"
            style={{ color: '#8B949E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#30363D')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Saved configs dropdown */}
        {savedConfigs.length > 0 && (
          <div className="px-5 pt-4">
            <button
              onClick={() => setShowSaved(!showSaved)}
              className="flex items-center gap-2 text-sm px-3 py-2 rounded-md w-full transition-colors"
              style={{
                backgroundColor: '#2D333B',
                color: '#8B949E',
                border: '1px solid #30363D',
              }}
            >
              <ChevronDown
                size={16}
                style={{
                  transform: showSaved ? 'rotate(180deg)' : 'rotate(0)',
                  transition: 'transform 200ms',
                }}
              />
              已保存的连接 ({savedConfigs.length})
            </button>
            {showSaved && (
              <div
                className="mt-1 rounded-md overflow-hidden"
                style={{ backgroundColor: '#2D333B', border: '1px solid #30363D' }}
              >
                {savedConfigs.map((config) => (
                  <div
                    key={config.id}
                    onClick={() => handleLoadConfig(config)}
                    className="flex items-center justify-between px-3 py-2.5 cursor-pointer transition-colors"
                    style={{ borderBottom: '1px solid #30363D' }}
                    onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#30363D')}
                    onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div>
                      <div className="text-sm font-medium" style={{ color: '#E6EDF3' }}>
                        {config.name}
                      </div>
                      <div className="text-xs" style={{ color: '#8B949E' }}>
                        {config.protocol}://{config.host}:{config.port}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConfig(e, config.id)}
                      className="p-1.5 rounded-md transition-colors"
                      style={{ color: '#F85149' }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(248,81,73,0.15)')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Form */}
        <div className="px-5 py-4 space-y-3">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#8B949E' }}>
              站点名称
            </label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="我的服务器"
              className="w-full h-10 px-3 rounded-md text-sm outline-none transition-colors"
              style={{
                backgroundColor: '#2D333B',
                color: '#E6EDF3',
                border: '1px solid #30363D',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#4F8EF7')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#30363D')}
            />
          </div>

          {/* Protocol + Host + Port */}
          <div className="flex gap-2">
            <div className="w-24">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#8B949E' }}>
                协议
              </label>
              <select
                value={form.protocol}
                onChange={(e) => setForm({ ...form, protocol: e.target.value as 'ftp' | 'ftps' | 'sftp' })}
                className="w-full h-10 px-2 rounded-md text-sm outline-none transition-colors appearance-none"
                style={{
                  backgroundColor: '#2D333B',
                  color: '#E6EDF3',
                  border: '1px solid #30363D',
                }}
              >
                <option value="ftp">FTP</option>
                <option value="ftps">FTPS</option>
                <option value="sftp">SFTP</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#8B949E' }}>
                主机地址
              </label>
              <input
                type="text"
                value={form.host}
                onChange={(e) => setForm({ ...form, host: e.target.value })}
                placeholder="ftp.example.com"
                className="w-full h-10 px-3 rounded-md text-sm outline-none transition-colors"
                style={{
                  backgroundColor: '#2D333B',
                  color: '#E6EDF3',
                  border: '1px solid #30363D',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#4F8EF7')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#30363D')}
              />
            </div>
            <div className="w-20">
              <label className="block text-xs font-medium mb-1.5" style={{ color: '#8B949E' }}>
                端口
              </label>
              <input
                type="number"
                value={form.port}
                onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 21 })}
                className="w-full h-10 px-3 rounded-md text-sm outline-none transition-colors"
                style={{
                  backgroundColor: '#2D333B',
                  color: '#E6EDF3',
                  border: '1px solid #30363D',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#4F8EF7')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#30363D')}
              />
            </div>
          </div>

          {/* Username */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#8B949E' }}>
              用户名
            </label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="anonymous"
              className="w-full h-10 px-3 rounded-md text-sm outline-none transition-colors"
              style={{
                backgroundColor: '#2D333B',
                color: '#E6EDF3',
                border: '1px solid #30363D',
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = '#4F8EF7')}
              onBlur={(e) => (e.currentTarget.style.borderColor = '#30363D')}
            />
          </div>

          {/* Password */}
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: '#8B949E' }}>
              密码
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="••••••••"
                className="w-full h-10 px-3 pr-16 rounded-md text-sm outline-none transition-colors"
                style={{
                  backgroundColor: '#2D333B',
                  color: '#E6EDF3',
                  border: '1px solid #30363D',
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = '#4F8EF7')}
                onBlur={(e) => (e.currentTarget.style.borderColor = '#30363D')}
              />
              <button
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs rounded transition-colors"
                style={{ color: '#8B949E' }}
              >
                {showPassword ? '隐藏' : '显示'}
              </button>
            </div>
          </div>

          {/* Error message */}
          {connectionError && (
            <div
              className="px-3 py-2 rounded-md text-sm"
              style={{
                backgroundColor: 'rgba(248,81,73,0.15)',
                color: '#F85149',
                border: '1px solid rgba(248,81,73,0.3)',
              }}
            >
              {connectionError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderTop: '1px solid #30363D' }}
        >
          <button
            onClick={() => setShowConnectionModal(false)}
            className="px-4 py-2 text-sm rounded-md transition-colors"
            style={{ color: '#8B949E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2D333B')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            取消
          </button>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!form.host.trim() || !form.name.trim()}
              className="flex items-center gap-1.5 px-4 py-2 text-sm rounded-md transition-all"
              style={{
                backgroundColor: form.host.trim() && form.name.trim() ? '#2D333B' : 'transparent',
                color: form.host.trim() && form.name.trim() ? '#E6EDF3' : '#8B949E',
                opacity: form.host.trim() && form.name.trim() ? 1 : 0.5,
              }}
            >
              <Save size={14} />
              保存
            </button>
            <button
              onClick={handleConnect}
              disabled={connectionState === 'connecting'}
              className="flex items-center gap-1.5 px-5 py-2 text-sm font-medium rounded-md transition-all"
              style={{
                backgroundColor: '#4F8EF7',
                color: '#FFFFFF',
                opacity: connectionState === 'connecting' ? 0.7 : 1,
              }}
            >
              {connectionState === 'connecting' ? (
                <>
                  <div
                    className="w-4 h-4 border-2 border-white border-t-transparent rounded-full"
                    style={{ animation: 'spin 0.6s linear infinite' }}
                  />
                  连接中...
                </>
              ) : (
                <>
                  <Plug size={16} />
                  连接
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalSlideIn {
          from {
            transform: translateY(20px);
            opacity: 0;
          }
          to {
            transform: translateY(0);
            opacity: 1;
          }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

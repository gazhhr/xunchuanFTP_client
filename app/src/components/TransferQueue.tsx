import { useRef, useCallback } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  X,
  AlertCircle,
  RotateCcw,
  ChevronDown,
  Trash2,
  Clock,
  Zap,
} from 'lucide-react';
import { useRealFTPStore, formatFileSize } from '@/store/realFTPStore';
import type { TransferTask } from '@/types';

export default function TransferQueue() {
  const store = useRealFTPStore();
  const {
    transferTasks,
    queueHeight,
    activeQueueTab,
    isDraggingQueue,
    setQueueHeight,
    setActiveQueueTab,
    setIsDraggingQueue,
    removeTransferTask,
    retryTransferTask,
    clearCompletedTasks,
  } = store;

  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      dragStartY.current = e.clientY;
      dragStartHeight.current = queueHeight;
      setIsDraggingQueue(true);

      const handleMouseMove = (e: MouseEvent) => {
        const delta = dragStartY.current - e.clientY;
        setQueueHeight(dragStartHeight.current + delta);
      };

      const handleMouseUp = () => {
        setIsDraggingQueue(false);
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [queueHeight, setQueueHeight, setIsDraggingQueue]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      dragStartY.current = e.touches[0].clientY;
      dragStartHeight.current = queueHeight;
      setIsDraggingQueue(true);

      const handleTouchMove = (e: TouchEvent) => {
        const delta = dragStartY.current - e.touches[0].clientY;
        setQueueHeight(dragStartHeight.current + delta);
      };

      const handleTouchEnd = () => {
        setIsDraggingQueue(false);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('touchend', handleTouchEnd);
      };

      document.addEventListener('touchmove', handleTouchMove);
      document.addEventListener('touchend', handleTouchEnd);
    },
    [queueHeight, setQueueHeight, setIsDraggingQueue]
  );

  const activeTasks = transferTasks.filter(
    (t) => t.status === 'queued' || t.status === 'active' || t.status === 'paused'
  );
  const historyTasks = transferTasks.filter(
    (t) => t.status === 'completed' || t.status === 'failed'
  );

  const displayedTasks = activeQueueTab === 'active' ? activeTasks : historyTasks;

  return (
    <div
      className="shrink-0 flex flex-col"
      style={{
        height: queueHeight,
        borderTop: '1px solid #30363D',
        backgroundColor: '#1A1D21',
      }}
    >
      {/* Drag handle */}
      <div
        className="flex items-center justify-center h-5 cursor-row-resize select-none"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        style={{
          backgroundColor: isDraggingQueue ? '#2D333B' : 'transparent',
          transition: 'background-color 100ms',
        }}
      >
        <div className="w-10 h-1 rounded-full" style={{ backgroundColor: '#30363D' }} />
      </div>

      {/* Tabs */}
      <div className="flex items-center px-4" style={{ borderBottom: '1px solid #30363D' }}>
        <button
          onClick={() => setActiveQueueTab('active')}
          className="relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
          style={{ color: activeQueueTab === 'active' ? '#E6EDF3' : '#8B949E' }}
        >
          <Zap size={13} />
          传输中
          {activeTasks.length > 0 && (
            <span
              className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]"
              style={{ backgroundColor: '#4F8EF7', color: '#FFFFFF' }}
            >
              {activeTasks.length}
            </span>
          )}
          {activeQueueTab === 'active' && (
            <div
              className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
              style={{ backgroundColor: '#4F8EF7' }}
            />
          )}
        </button>
        <button
          onClick={() => setActiveQueueTab('history')}
          className="relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors"
          style={{ color: activeQueueTab === 'history' ? '#E6EDF3' : '#8B949E' }}
        >
          <Clock size={13} />
          历史
          {historyTasks.length > 0 && (
            <span
              className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px]"
              style={{ backgroundColor: '#30363D', color: '#8B949E' }}
            >
              {historyTasks.length}
            </span>
          )}
          {activeQueueTab === 'history' && (
            <div
              className="absolute bottom-0 left-3 right-3 h-0.5 rounded-full"
              style={{ backgroundColor: '#4F8EF7' }}
            />
          )}
        </button>

        {activeQueueTab === 'history' && historyTasks.length > 0 && (
          <button
            onClick={clearCompletedTasks}
            className="ml-auto flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors"
            style={{ color: '#8B949E' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#30363D')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <Trash2 size={12} />
            清除
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto" style={{ minHeight: 0 }}>
        {displayedTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full">
            <ChevronDown size={24} style={{ color: '#30363D' }} />
            <p className="text-xs mt-1" style={{ color: '#8B949E' }}>
              {activeQueueTab === 'active' ? '暂无传输任务' : '暂无历史记录'}
            </p>
          </div>
        ) : (
          displayedTasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              onRemove={removeTransferTask}
              onRetry={retryTransferTask}
            />
          ))
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  onRemove,
  onRetry,
}: {
  task: TransferTask;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}) {
  const progress = task.fileSize > 0 ? Math.round((task.transferred / task.fileSize) * 100) : 0;

  const statusConfig = {
    queued: { icon: Clock, color: '#8B949E', label: '排队中' },
    active: { icon: task.direction === 'upload' ? ArrowUp : ArrowDown, color: '#4F8EF7', label: '传输中' },
    paused: { icon: Clock, color: '#E3B341', label: '已暂停' },
    completed: { icon: Check, color: '#3FB950', label: '已完成' },
    failed: { icon: AlertCircle, color: '#F85149', label: '失败' },
  };

  const status = statusConfig[task.status];
  const StatusIcon = status.icon;

  return (
    <div
      className="flex items-center px-3 py-2"
      style={{ borderBottom: '1px solid rgba(48,54,61,0.5)' }}
    >
      {/* Direction icon */}
      <div className="w-6 flex items-center justify-center shrink-0 mr-2">
        {task.direction === 'upload' ? (
          <ArrowUp size={14} style={{ color: '#4F8EF7' }} />
        ) : (
          <ArrowDown size={14} style={{ color: '#3FB950' }} />
        )}
      </div>

      {/* File info */}
      <div className="flex-1 min-w-0 mr-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs truncate block" style={{ color: '#E6EDF3' }}>
            {task.fileName}
          </span>
          <span className="text-[10px] shrink-0" style={{ color: '#8B949E' }}>
            {formatFileSize(task.fileSize)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="flex items-center gap-2 mt-1">
          <div
            className="flex-1 h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: '#2D333B' }}
          >
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{
                width: `${task.status === 'completed' ? 100 : progress}%`,
                backgroundColor:
                  task.status === 'completed'
                    ? '#3FB950'
                    : task.status === 'failed'
                    ? '#F85149'
                    : '#4F8EF7',
              }}
            />
          </div>
          <span className="text-[10px] shrink-0" style={{ color: '#8B949E', fontVariantNumeric: 'tabular-nums' }}>
            {task.status === 'completed' ? '100%' : `${progress}%`}
          </span>
        </div>

        {/* Speed / Status */}
        <div className="flex items-center gap-1 mt-0.5">
          <StatusIcon size={10} style={{ color: status.color }} />
          <span className="text-[10px]" style={{ color: status.color }}>
            {status.label}
          </span>
          {task.status === 'active' && task.speed > 0 && (
            <span className="text-[10px]" style={{ color: '#8B949E' }}>
              {task.speed.toFixed(1)} KB/s
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {task.status === 'failed' && (
          <button
            onClick={() => onRetry(task.id)}
            className="p-1 rounded transition-colors"
            style={{ color: '#E3B341' }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(227,179,65,0.15)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          >
            <RotateCcw size={14} />
          </button>
        )}
        <button
          onClick={() => onRemove(task.id)}
          className="p-1 rounded transition-colors"
          style={{ color: '#8B949E' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'rgba(248,81,73,0.15)')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

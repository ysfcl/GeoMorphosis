'use client';

import { useEffect } from 'react';
import { AlertTriangle, CheckCircle, Info, X, ShieldAlert } from 'lucide-react';

export default function Toast({ type = 'info', title, message, onClose, autoClose = 5000 }) {
  // Belirli bir süre sonra bildirimin otomatik kapanmasını sağlıyoruz
  useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(onClose, autoClose);
      return () => clearTimeout(timer);
    }
  }, [autoClose, onClose]);

  // Farklı bildirim tipleri için renk ve ikon konfigürasyonları
  const types = {
    danger: {
      icon: <ShieldAlert className="text-red-500" size={28} />,
      bg: 'bg-red-50',
      border: 'border-red-200',
      titleColor: 'text-red-800',
      messageColor: 'text-red-600',
    },
    warning: {
      icon: <AlertTriangle className="text-yellow-500" size={28} />,
      bg: 'bg-yellow-50',
      border: 'border-yellow-200',
      titleColor: 'text-yellow-800',
      messageColor: 'text-yellow-600',
    },
    success: {
      icon: <CheckCircle className="text-green-500" size={28} />,
      bg: 'bg-green-50',
      border: 'border-green-200',
      titleColor: 'text-green-800',
      messageColor: 'text-green-600',
    },
    info: {
      icon: <Info className="text-blue-500" size={28} />,
      bg: 'bg-blue-50',
      border: 'border-blue-200',
      titleColor: 'text-blue-800',
      messageColor: 'text-blue-600',
    },
  };

  const style = types[type] || types.info;

  return (
    <div className={`fixed bottom-6 right-6 z-[9999] flex items-start gap-4 p-5 rounded-2xl border shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-8 fade-in duration-300 w-full max-w-sm ${style.bg} ${style.border}`}>
      <div className="flex-shrink-0 mt-0.5">
        {style.icon}
      </div>
      
      <div className="flex-1">
        {title && <h4 className={`text-base font-bold ${style.titleColor}`}>{title}</h4>}
        <p className={`text-sm mt-1 font-medium ${style.messageColor}`}>{message}</p>
      </div>
      
      <button 
        onClick={onClose} 
        className={`flex-shrink-0 p-1.5 rounded-full hover:bg-black/5 transition-colors ${style.messageColor}`}
      >
        <X size={20} />
      </button>
    </div>
  );
}
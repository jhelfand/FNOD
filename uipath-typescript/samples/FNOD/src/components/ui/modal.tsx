import React from 'react';

export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
}> = ({ open, onClose, title, children }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 px-4 py-8 bg-black/40" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="mx-auto w-[90%] max-w-6xl bg-white rounded-lg shadow-lg overflow-hidden max-h-[calc(100vh-6rem)] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="text-lg font-semibold">{title}</div>
          <button aria-label="close" onClick={onClose} className="text-gray-500 hover:text-gray-700">✕</button>
        </div>
        <div className="p-4 overflow-auto">{children}</div>
      </div>
    </div>
  );
};

export default Modal;

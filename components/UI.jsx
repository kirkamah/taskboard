'use client';

export function Modal({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div
        className={`bg-white rounded-lg w-full max-h-[85vh] overflow-y-auto ${wide ? 'max-w-2xl' : 'max-w-lg'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

export function Toggle({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 px-3 py-2 text-sm rounded-lg border ${active ? 'bg-gray-900 text-white border-gray-900' : 'bg-white border-gray-300'}`}
    >
      {children}
    </button>
  );
}

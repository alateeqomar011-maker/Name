import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  labelledBy: string;
  describedBy?: string;
  children: ReactNode;
  size?: 'sm' | 'md';
  /** Hide the corner close button (the body supplies its own actions). */
  hideClose?: boolean;
  className?: string;
}

/**
 * Native <dialog> shown with showModal(): the browser traps focus, makes the
 * page behind it inert and handles Escape.
 */
export function Modal({ open, onClose, labelledBy, describedBy, children, size = 'md', hideClose, className }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      document.documentElement.classList.add('modal-open');
    } else if (!open && dialog.open) {
      dialog.close();
    }
    if (!open) document.documentElement.classList.remove('modal-open');
  }, [open]);

  useEffect(() => () => document.documentElement.classList.remove('modal-open'), []);

  return (
    <dialog
      ref={ref}
      className={`modal modal-${size} ${className ?? ''}`}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onCancel={(e) => {
        e.preventDefault();
        onCloseRef.current();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onCloseRef.current();
      }}
    >
      {open && (
        <div className="modal-body">
          {!hideClose && (
            <button type="button" className="btn btn-icon btn-ghost modal-close" aria-label="Close" onClick={onClose}>
              <X size={18} />
            </button>
          )}
          {children}
        </div>
      )}
    </dialog>
  );
}

"use client";

import { ImagePlus, UploadCloud } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export const ACCEPT = "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif,image/tiff";
const MAX = 25 * 1024 * 1024;

export interface UploadResult<T> {
  file: File;
  data?: T;
  error?: string;
}

/** Uploads a file with progress events (fetch has no upload progress). */
export function uploadWithProgress<T>(url: string, form: FormData, onProgress: (pct: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        body = null;
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as T);
      else {
        const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? `Upload failed (${xhr.status})`;
        reject(Object.assign(new Error(msg), { status: xhr.status, code: (body as { error?: { code?: string } })?.error?.code }));
      }
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection and try again."));
    xhr.send(form);
  });
}

export function validateFile(file: File): string | null {
  if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|avif|heic|heif|tiff?)$/i.test(file.name)) {
    return `${file.name} isn't an image.`;
  }
  if (file.size > MAX) return `${file.name} is larger than 25 MB.`;
  return null;
}

export function Dropzone({
  onFiles,
  multiple,
  disabled,
  children,
  className,
  compact,
}: {
  onFiles: (files: File[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const handle = useCallback(
    (list: FileList | null) => {
      if (!list?.length) return;
      const files = Array.from(list);
      onFiles(multiple ? files : files.slice(0, 1));
    },
    [multiple, onFiles],
  );
  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      onClick={() => !disabled && input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !disabled && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (!disabled) handle(e.dataTransfer.files);
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed text-center transition",
        over ? "border-iris-400 bg-iris-50/70" : "border-line-strong bg-surface/70 hover:border-iris-300 hover:bg-surface",
        disabled && "pointer-events-none opacity-60",
        compact ? "px-4 py-6" : "px-6 py-14 sm:py-20",
        className,
      )}
    >
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          handle(e.target.files);
          e.target.value = "";
        }}
      />
      {children ?? (
        <>
          <span
            className={cn(
              "flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--color-iris-500),var(--color-coral-500))] text-white shadow-glow transition group-hover:scale-105",
              compact ? "size-10" : "size-14",
            )}
          >
            {compact ? <ImagePlus className="size-5" /> : <UploadCloud className="size-7" />}
          </span>
          <p className={cn("font-semibold", compact ? "mt-3 text-sm" : "mt-5 text-lg")}>
            {over ? "Drop to upload" : multiple ? "Drop product photos here" : "Drop a product photo here"}
          </p>
          <p className="mt-1 text-sm text-muted">
            or <span className="font-medium text-iris-600">browse your device</span> · JPG, PNG, WebP up to 25 MB
          </p>
        </>
      )}
    </div>
  );
}

import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from './ui/button';

interface Props {
  onFileSelected?: (file: File | null) => void;
  /** Lo maneja el padre (es él quien procesa el archivo). */
  isProcessing?: boolean;
}

export function DragDrop({ onFileSelected, isProcessing = false }: Props) {
  const [file, setFile] = useState<File | null>(null);

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const selectedFile = acceptedFiles[0];
      if (!selectedFile) return;

      setFile(selectedFile);
      onFileSelected?.(selectedFile);
    },
    [onFileSelected]
  );

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop,
      accept: { 'application/pdf': [] },
      maxFiles: 1,
      disabled: isProcessing,
    });

  const removeFile = () => {
    setFile(null);
    onFileSelected?.(null);
  };

  return (
    <div className="w-full">
      {/* DROPZONE */}
      <div
        {...getRootProps()}
        className={`
          flex flex-col items-center justify-center
          rounded-lg border-2 border-dashed
          p-10 text-center transition
          cursor-pointer
          ${isProcessing ? 'opacity-60 cursor-not-allowed' : ''}
          ${isDragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-gray-50'}
        `}
      >
        <input {...getInputProps()} />

        {isDragReject && (
          <p className="text-sm text-[var(--arca-accent-neg)]">
            ❌ Solo se permiten archivos PDF
          </p>
        )}

        {!file && !isDragActive && (
          <p className="text-gray-600">
            📄 Arrastrá el extracto bancario (PDF) acá <br />
            <span className="text-sm text-gray-500">
              o hacé click para seleccionarlo
            </span>
          </p>
        )}

        {isDragActive && !file && (
          <p className="text-indigo-600 font-medium">📥 Soltá el PDF acá</p>
        )}

        {file && <p className="text-gray-800 font-medium">📄 {file.name}</p>}
      </div>

      {/* FILE INFO */}
      {file && (
        <div className="mt-3 flex items-center gap-4 text-sm">
          {!isProcessing && (
            <Button onClick={removeFile} variant="default" size="sm">
              Eliminar
            </Button>
          )}
        </div>
      )}

      {/* PROCESSING */}
      {isProcessing && (
        <p className="mt-3 text-sm text-gray-600">
          ⏳ Procesando extracto bancario...
        </p>
      )}
    </div>
  );
}

'use client';

import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Upload, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  getPayrollEmployerConfig,
  saveFirmaDigitalEmpleador,
} from '@/actions/sueldos';

interface SueldosFirmaDigitalProps {
  clientId: string;
}

export function SueldosFirmaDigital({
  clientId,
}: SueldosFirmaDigitalProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);

  const { data: config } = useQuery({
    queryKey: ['payroll-employer-config', clientId],
    queryFn: () => getPayrollEmployerConfig({ data: { clientId } }),
    enabled: !!clientId,
  });

  const firmaUrl = config?.firmaEmpleadorUrl ?? null;

  function readFileAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (ev) => resolve(ev.target?.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('El archivo debe ser una imagen.');
      return;
    }
    setSaving(true);
    try {
      const dataUrl = await readFileAsDataUrl(file);
      await saveFirmaDigitalEmpleador({
        data: { clientId, firmaDigitalEmpleador: dataUrl },
      });
      await queryClient.invalidateQueries({
        queryKey: ['payroll-employer-config', clientId],
      });
      toast.success('Firma guardada.');
    } catch {
      toast.error('Error al guardar la firma.');
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function handleRemove() {
    setSaving(true);
    try {
      await saveFirmaDigitalEmpleador({
        data: { clientId, firmaDigitalEmpleador: null },
      });
      await queryClient.invalidateQueries({
        queryKey: ['payroll-employer-config', clientId],
      });
      toast.success('Firma eliminada.');
    } catch {
      toast.error('Error al eliminar la firma.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-[560px] mx-auto mt-[36px]">
      {/* Heading row */}
      <div className="flex items-center gap-[10px] mb-[6px]">
        <h2
          className="font-[family-name:var(--ff-display)] font-semibold text-[17px] leading-tight"
          style={{ color: '#12131A' }}
        >
          Firma digital del empleador
        </h2>
      </div>

      {/* Description */}
      <p className="text-[13.5px] mb-[22px]" style={{ color: '#6E7079' }}>
        La imagen se imprimirá sobre la línea &quot;Firma y sello del
        empleador&quot; en todos los recibos de esta empresa.
      </p>

      {firmaUrl ? (
        /* Signature preview */
        <div className="flex items-center gap-5">
          <div
            className="flex h-24 w-56 items-center justify-center rounded-[10px] p-2"
            style={{ border: '1px solid #ECEAE3', background: '#FBFAF6' }}
          >
            <img
              src={firmaUrl}
              alt="Firma del empleador"
              className="max-h-full max-w-full object-contain"
            />
          </div>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              className="bg-white border border-[#DFDCD3] rounded-[10px] text-[13.5px] font-semibold px-[17px] py-[10px] hover:bg-[#FBFAF6] disabled:opacity-50 flex items-center gap-2 transition-colors"
              style={{ color: '#3E404A' }}
            >
              <Upload style={{ width: 14, height: 14 }} />
              Cambiar
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={saving}
              className="bg-white border border-[#DFDCD3] rounded-[10px] text-[13.5px] font-semibold px-[17px] py-[10px] hover:bg-[#FBFAF6] disabled:opacity-50 flex items-center gap-2 transition-colors"
              style={{ color: '#c0392b' }}
            >
              {saving ? (
                <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
              ) : (
                <X style={{ width: 14, height: 14 }} />
              )}
              Eliminar
            </button>
          </div>
        </div>
      ) : (
        /* Dropzone */
        <div
          className="flex flex-col items-center justify-center text-center px-6 py-[38px] rounded-[12px]"
          style={{
            border: '1.5px dashed #DFDCD3',
            background: '#FBFAF6',
          }}
        >
          {/* Upload icon tile */}
          <div
            className="w-11 h-11 rounded-[10px] bg-white flex items-center justify-center mb-[14px]"
            style={{ border: '1px solid #ECEAE3' }}
          >
            <Upload style={{ width: 18, height: 18, color: '#9B9CA3' }} />
          </div>
          <p className="text-[13px] mb-[18px] max-w-[320px]" style={{ color: '#9B9CA3' }}>
            Arrastrá una imagen (PNG con fondo transparente) o subila desde tu equipo.
          </p>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={saving}
            className="bg-[#12131A] text-white rounded-[10px] px-[17px] py-[10px] text-[13.5px] font-semibold hover:bg-black disabled:opacity-50 flex items-center gap-2 transition-colors"
          >
            {saving ? (
              <Loader2 style={{ width: 14, height: 14 }} className="animate-spin" />
            ) : (
              <Upload style={{ width: 14, height: 14 }} />
            )}
            Adjuntar imagen de firma
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  );
}

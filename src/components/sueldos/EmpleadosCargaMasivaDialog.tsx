'use client';

import { useState, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, Loader2, Download } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { createEmpleadosMasivo } from '@/actions/sueldos';

const TIPO_JORNADA_MAP: Record<string, 'full_time' | 'part_time' | 'reducida'> =
  {
    'tiempo completo': 'full_time',
    'part time': 'part_time',
    'medio tiempo': 'part_time',
    reducida: 'reducida',
    full_time: 'full_time',
    part_time: 'part_time',
  };

function excelDateToISO(value: unknown): string {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10);
    const d = new Date(trimmed);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return trimmed;
  }
  if (typeof value === 'number' && value > 0) {
    const d = new Date((value - 25569) * 86400 * 1000);
    return d.toISOString().slice(0, 10);
  }
  return '';
}

function getCell(row: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

interface EmpleadosCargaMasivaDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  /** Si se omite, el servidor usa el primer perfil del cliente con liquidación de sueldos. */
  profileId?: string;
  onSuccess: () => void;
}

const PLANTILLA = `Apellido	Nombre	CUIT/CUIL	Fecha ingreso	Convenio	Categoría	Tipo jornada
Pérez	Juan	20123456789	2020-01-15	Comercio	1	Tiempo completo
García	María	27234567890	2021-06-01	Comercio	2	Part time`;

export function EmpleadosCargaMasivaDialog({
  open,
  onOpenChange,
  clientId,
  profileId,
  onSuccess,
}: EmpleadosCargaMasivaDialogProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<{
    created: number;
    errors: { row: number; message: string }[];
  } | null>(null);

  const masivo = useMutation({
    mutationFn: (
      empleados: Parameters<
        typeof createEmpleadosMasivo
      >[0]['data']['empleados']
    ) =>
      createEmpleadosMasivo({
        data: { clientId, profileId, empleados },
      }),
    onSuccess: (data) => {
      setResult(data);
      queryClient.invalidateQueries({ queryKey: ['empleados', clientId] });
      queryClient.invalidateQueries({
        queryKey: ['import-empleados', clientId],
      });
      if (data.errors.length === 0) {
        toast.success(`${data.created} empleado(s) cargados correctamente`);
      } else if (data.created > 0) {
        toast.warning(
          `${data.created} cargados, ${data.errors.length} con error`
        );
      } else {
        toast.error('No se pudo cargar ningún empleado');
      }
    },
    onError: (e) => toast.error(e.message),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    setFile(f ?? null);
    setResult(null);
    e.target.value = '';
  };

  const parseAndSend = () => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = ev.target?.result;
        if (!data) throw new Error('No se pudo leer el archivo');
        const wb = XLSX.read(data, { type: 'array' });
        const firstSheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
          firstSheet,
          { raw: false }
        );
        if (rows.length === 0) {
          toast.error('El archivo no tiene filas de datos');
          return;
        }
        const empleados = rows
          .map((row, index) => {
            const apellido = getCell(row, 'Apellido', 'apellido');
            const nombre = getCell(row, 'Nombre', 'nombre');
            const cuilCuil = getCell(
              row,
              'CUIT/CUIL',
              'CUIT/CUIL',
              'CUIT',
              'CUIL',
              'cuil_cuil',
              'cuilCuil'
            );
            const fechaRaw = row['Fecha ingreso'] ?? row.fecha_ingreso;
            const fechaIngreso =
              excelDateToISO(fechaRaw) ||
              getCell(row, 'Fecha ingreso', 'fecha_ingreso');
            const convenioNombre = getCell(row, 'Convenio', 'convenio');
            const categoriaCodigo = getCell(
              row,
              'Categoría',
              'Categoria',
              'categoria',
              'Código'
            );
            const tipoJornadaStr = getCell(row, 'Tipo jornada', 'tipo_jornada');

            return {
              apellido: apellido || '',
              nombre: nombre || '',
              cuilCuil: cuilCuil || '',
              fechaIngreso: fechaIngreso || '2020-01-01',
              convenioNombre: convenioNombre || '',
              categoriaCodigo: categoriaCodigo || '',
              tipoJornada:
                TIPO_JORNADA_MAP[tipoJornadaStr.toLowerCase()] ?? 'full_time',
            };
          })
          .filter((e) => e.nombre.trim() && e.apellido.trim());
        if (empleados.length === 0) {
          toast.error('No hay filas válidas (Nombre y Apellido requeridos)');
          return;
        }
        masivo.mutate(empleados);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : 'Error al leer el Excel'
        );
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleClose = () => {
    setFile(null);
    setResult(null);
    onSuccess();
    onOpenChange(false);
  };

  const downloadPlantilla = () => {
    const blob = new Blob([PLANTILLA], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla-empleados.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setFile(null);
          setResult(null);
        }
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Carga masiva de empleados</DialogTitle>
          <DialogDescription>
            Suba un archivo Excel (.xlsx) o CSV con columnas: Apellido, Nombre,
            CUIT/CUIL, Fecha ingreso, Convenio, Categoría, Tipo jornada. La
            primera fila debe ser el encabezado.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
          />
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => inputRef.current?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              {file ? file.name : 'Seleccionar archivo'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={downloadPlantilla}
            >
              <Download className="mr-2 h-4 w-4" />
              Descargar plantilla CSV
            </Button>
          </div>
          {result && (
            <div className="rounded-lg border p-3 text-sm">
              <p className="font-medium text-[var(--arca-accent-pos-fg)]">
                {result.created} empleado(s) cargados
              </p>
              {result.errors.length > 0 && (
                <ul className="mt-2 max-h-32 overflow-y-auto text-[var(--arca-accent-neg)]">
                  {result.errors.map((e, i) => (
                    <li key={i}>
                      Fila {e.row}: {e.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose()}>
            Cerrar
          </Button>
          <Button onClick={parseAndSend} disabled={!file || masivo.isPending}>
            {masivo.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="mr-2 h-4 w-4" />
            )}
            Cargar empleados
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

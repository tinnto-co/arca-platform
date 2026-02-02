import { useState } from "react"
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Pencil, Trash2 } from "lucide-react"

const GASTO_OPTIONS = [
    "Sin especificar",
    "Impuestos",
    "Servicios",
    "Alquiler",
    "Sueldos",
    "Proveedores",
    "Gastos bancarios",
    "Otros",
]

type Movement = {
    fecha: string
    tipo: "ingreso" | "egreso"
    monto: string
    infoExtra: string
    tipoGasto?: string
    clientId?: string
}

type RenderPdfInfoProps = {
    data: {
        banco: string
        saldo_inicial: string
        saldo_final: string
        ingresos: Movement[]
        egresos: Movement[]
    }
    clientId: string | null
}


const parseMonto = (monto: string) =>
    Number(
        monto
            .replace(/\./g, "")
            .replace(",", ".")
            .replace(/[^0-9.-]+/g, "")
    ) || 0

export function RenderPdfInfo({ data }: RenderPdfInfoProps) {
    const [ingresos, setIngresos] = useState<Movement[]>(
        data.ingresos.map((i) => ({
            ...i,
            tipoGasto: i.tipoGasto ?? "Sin especificar",
        }))
    )

    const [egresos, setEgresos] = useState<Movement[]>(
        data.egresos.map((e) => ({
            ...e,
            tipoGasto: e.tipoGasto ?? "Sin especificar",
        }))
    )

    const [editing, setEditing] = useState<{
        tipo: "ingreso" | "egreso"
        index: number
        movement: Movement
    } | null>(null)

    const totalIngresos = ingresos.reduce(
        (acc, m) => acc + parseMonto(m.monto),
        0
    )

    const totalEgresos = egresos.reduce(
        (acc, m) => acc + parseMonto(m.monto),
        0
    )

    const saveEdit = () => {
        if (!editing) return

        const update = (list: Movement[]) =>
            list.map((m, i) => (i === editing.index ? editing.movement : m))

        editing.tipo === "ingreso"
            ? setIngresos(update)
            : setEgresos(update)

        setEditing(null)
    }

    return (
        <div className="space-y-8 mt-8">
            {/* HEADER CARDS */}
            <div className="flex flex-col gap-4 md:flex-row">
                {/* Banco */}
                <div className="rounded-lg border p-4 space-y-2 flex-1">
                    <h2 className="text-lg font-semibold">{data.banco}</h2>

                    <div className="flex gap-6 text-sm">
                        <div>
                            <span className="text-muted-foreground">
                                Saldo inicial:
                            </span>{" "}
                            <strong>{data.saldo_inicial}</strong>
                        </div>
                        <div>
                            <span className="text-muted-foreground">
                                Saldo final:
                            </span>{" "}
                            <strong>{data.saldo_final}</strong>
                        </div>
                    </div>
                </div>

                {/* Total Ingresos */}
                <div className="rounded-lg border p-4 flex-1 flex flex-col justify-center">
                    <span className="text-sm text-muted-foreground">
                        Total Ingresos
                    </span>
                    <span className="text-2xl font-bold text-emerald-600">
                        {totalIngresos.toLocaleString("es-AR", {
                            style: "currency",
                            currency: "ARS",
                        })}
                    </span>
                </div>

                {/* Total Egresos */}
                <div className="rounded-lg border p-4 flex-1 flex flex-col justify-center">
                    <span className="text-sm text-muted-foreground">
                        Total Egresos
                    </span>
                    <span className="text-2xl font-bold text-red-600">
                        {totalEgresos.toLocaleString("es-AR", {
                            style: "currency",
                            currency: "ARS",
                        })}
                    </span>
                </div>
            </div>

            {/* TABLAS */}
            <MovementsTable
                title="Ingresos"
                data={ingresos}
                showTipoGasto
                onDelete={(i) =>
                    setIngresos((prev) => prev.filter((_, idx) => idx !== i))
                }
                onEdit={(m, i) =>
                    setEditing({ tipo: "ingreso", index: i, movement: m })
                }
                onTipoGastoChange={(index, value) =>
                    setIngresos((prev) =>
                        prev.map((m, i) =>
                            i === index ? { ...m, tipoGasto: value } : m
                        )
                    )
                }
            />

            <MovementsTable
                title="Egresos"
                data={egresos}
                showTipoGasto
                onDelete={(i) =>
                    setEgresos((prev) => prev.filter((_, idx) => idx !== i))
                }
                onEdit={(m, i) =>
                    setEditing({ tipo: "egreso", index: i, movement: m })
                }
                onTipoGastoChange={(index, value) =>
                    setEgresos((prev) =>
                        prev.map((m, i) =>
                            i === index ? { ...m, tipoGasto: value } : m
                        )
                    )
                }
            />

            {/* MODAL EDITAR */}
            <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Editar movimiento</DialogTitle>
                    </DialogHeader>

                    {editing && (
                        <div className="space-y-4">
                            <div>
                                <Label>Fecha</Label>
                                <Input
                                    value={editing.movement.fecha}
                                    onChange={(e) =>
                                        setEditing({
                                            ...editing,
                                            movement: {
                                                ...editing.movement,
                                                fecha: e.target.value,
                                            },
                                        })
                                    }
                                />
                            </div>

                            <div>
                                <Label>Descripción</Label>
                                <Input
                                    value={editing.movement.infoExtra}
                                    onChange={(e) =>
                                        setEditing({
                                            ...editing,
                                            movement: {
                                                ...editing.movement,
                                                infoExtra: e.target.value,
                                            },
                                        })
                                    }
                                />
                            </div>

                            <div>
                                <Label>Monto</Label>
                                <Input
                                    value={editing.movement.monto}
                                    onChange={(e) =>
                                        setEditing({
                                            ...editing,
                                            movement: {
                                                ...editing.movement,
                                                monto: e.target.value,
                                            },
                                        })
                                    }
                                />
                            </div>

                            {editing.tipo === "egreso" && (
                                <div>
                                    <Label>Tipo de gasto</Label>
                                    <Select
                                        value={editing.movement.tipoGasto}
                                        onValueChange={(value) =>
                                            setEditing({
                                                ...editing,
                                                movement: {
                                                    ...editing.movement,
                                                    tipoGasto: value,
                                                },
                                            })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {GASTO_OPTIONS.map((opt) => (
                                                <SelectItem key={opt} value={opt}>
                                                    {opt}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setEditing(null)}
                        >
                            Cancelar
                        </Button>
                        <Button onClick={saveEdit}>
                            Guardar cambios
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}

function MovementsTable({
    title,
    data,
    showTipoGasto = false,
    onDelete,
    onEdit,
    onTipoGastoChange,
}: {
    title: string
    data: Movement[]
    showTipoGasto?: boolean
    onDelete: (index: number) => void
    onEdit: (movement: Movement, index: number) => void
    onTipoGastoChange?: (index: number, value: string) => void
}) {
    if (!data.length) {
        return (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                {title}: sin movimientos
            </div>
        )
    }

    return (
        <div className="rounded-lg border p-4 space-y-2">
            <h3 className="text-md font-semibold">{title}</h3>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Descripción</TableHead>
                        {showTipoGasto && (
                            <TableHead>Tipo de gasto</TableHead>
                        )}
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="text-center">
                            Acciones
                        </TableHead>
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {data.map((m, i) => (
                        <TableRow key={i}>
                            <TableCell>{m.fecha}</TableCell>
                            <TableCell className="max-w-[500px] whitespace-normal">
                                {m.infoExtra}
                            </TableCell>

                            {showTipoGasto && (
                                <TableCell>
                                    <Select
                                        value={m.tipoGasto}
                                        onValueChange={(v) =>
                                            onTipoGastoChange?.(i, v)
                                        }
                                    >
                                        <SelectTrigger className="h-8">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {GASTO_OPTIONS.map((opt) => (
                                                <SelectItem
                                                    key={opt}
                                                    value={opt}
                                                >
                                                    {opt}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </TableCell>
                            )}

                            <TableCell
                                className={`text-right font-medium ${title === "Ingresos"
                                    ? "text-emerald-600"
                                    : "text-red-600"
                                    }`}
                            >
                                {m.monto}
                            </TableCell>

                            <TableCell className="text-center">
                                <div className="flex justify-center gap-2">
                                    <button onClick={() => onEdit(m, i)}>
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                    <button onClick={() => onDelete(i)}>
                                        <Trash2 className="h-4 w-4 text-destructive" />
                                    </button>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

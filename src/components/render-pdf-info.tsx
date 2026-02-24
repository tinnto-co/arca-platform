import { useState } from "react"
import {
    Table,
    TableHeader,
    TableBody,
    TableRow,
    TableHead,
    TableCell,
} from "@/components/ui/table"
import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { TrendingUp, TrendingDown } from "lucide-react"
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Pencil, Trash2, MoreHorizontal } from "lucide-react"

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

    const [openIngresos, setOpenIngresos] = useState(true)
    const [openEgresos, setOpenEgresos] = useState(true)

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
        <div className="space-y-6">
            {/* HEADER: Resumen compacto */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="rounded-xl border bg-card p-4">
                    <p className="text-sm text-muted-foreground mb-1">Banco</p>
                    <p className="font-semibold">{data.banco}</p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                        <span>Inicial: <strong className="text-foreground">{data.saldo_inicial}</strong></span>
                        <span>Final: <strong className="text-foreground">{data.saldo_final}</strong></span>
                    </div>
                </div>
                <div className="rounded-xl border bg-card p-4 flex flex-col justify-center">
                    <p className="text-sm text-muted-foreground">Total Ingresos</p>
                    <p className="text-xl font-bold text-emerald-600">
                        {totalIngresos.toLocaleString("es-AR", {
                            style: "currency",
                            currency: "ARS",
                        })}
                    </p>
                </div>
                <div className="rounded-xl border bg-card p-4 flex flex-col justify-center">
                    <p className="text-sm text-muted-foreground">Total Egresos</p>
                    <p className="text-xl font-bold text-red-600">
                        {totalEgresos.toLocaleString("es-AR", {
                            style: "currency",
                            currency: "ARS",
                        })}
                    </p>
                </div>
            </div>

            {/* TABLAS */}
            <Collapsible open={openIngresos} onOpenChange={setOpenIngresos}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border bg-muted/50 px-4 py-3 text-base hover:bg-muted/70 transition-colors">
                    <span className="font-medium">Ingresos</span>
                    <TrendingUp className="h-5 w-5 text-emerald-600 shrink-0" />
                </CollapsibleTrigger>
                <CollapsibleContent forceMount className="mt-2 rounded-xl border bg-muted/20 px-4 py-3 data-[state=closed]:hidden overflow-x-auto">
                    <MovementsTable
                        title="Ingresos"
                        data={ingresos}
                        showTipoGasto
                        embedded
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
                </CollapsibleContent>
            </Collapsible>

            <Collapsible open={openEgresos} onOpenChange={setOpenEgresos}>
                <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border bg-muted/50 px-4 py-3 text-base hover:bg-muted/70 transition-colors">
                    <span className="font-medium">Egresos</span>
                    <TrendingDown className="h-5 w-5 text-red-600 shrink-0" />
                </CollapsibleTrigger>
                <CollapsibleContent forceMount className="mt-2 rounded-xl border bg-muted/20 px-4 py-3 data-[state=closed]:hidden overflow-x-auto">
                    <MovementsTable
                        title="Egresos"
                        data={egresos}
                        showTipoGasto
                        embedded
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
                </CollapsibleContent>
            </Collapsible>

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
    embedded = false,
    onDelete,
    onEdit,
    onTipoGastoChange,
}: {
    title: string
    data: Movement[]
    showTipoGasto?: boolean
    embedded?: boolean
    onDelete: (index: number) => void
    onEdit: (movement: Movement, index: number) => void
    onTipoGastoChange?: (index: number, value: string) => void
}) {
    if (!data.length) {
        return (
            <div className={embedded ? "text-sm text-muted-foreground" : "rounded-lg border p-4 text-sm text-muted-foreground"}>
                {title}: sin movimientos
            </div>
        )
    }

    return (
        <div className={embedded ? "space-y-2" : "rounded-lg border p-4 space-y-2"}>
            {!embedded && <h3 className="text-md font-semibold">{title}</h3>}

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Fecha</TableHead>
                        <TableHead>Descripción</TableHead>
                        {showTipoGasto && (
                            <TableHead>Tipo de gasto</TableHead>
                        )}
                        <TableHead className="text-right">Monto</TableHead>
                        <TableHead className="text-right w-14" />
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

                            <TableCell className="text-right w-14">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                        >
                                            <MoreHorizontal className="h-4 w-4" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => onEdit(m, i)}>
                                            <Pencil className="h-4 w-4 mr-2" />
                                            Editar
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={() => onDelete(i)}
                                            className="text-destructive focus:text-destructive"
                                        >
                                            <Trash2 className="h-4 w-4 mr-2" />
                                            Eliminar
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

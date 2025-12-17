import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  Trash2,
  MoreHorizontal,
  Search,
  Download,
  FileText,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  getInvoices,
  deleteInvoice,
  getInvoice,
} from "@/actions/invoice";
import { getClients } from "@/actions/client";

interface InvoiceData {
  id: string;
  direction: string;
  emitionDate: string;
  type: string;
  recipientName: string;
  recipientIdentityNumber: string;
  recipientIdentityType: string;
  emitterName: string;
  emitterIdentityNumber: string;
  emitterIdentityType: string;
  currency: string;
  currencyRate: string;
  salePoint: string;
  authorizationNumber: string;
  idFrom: string;
  idTo: string;
  amount: string;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export function InvoicesTable() {
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<
    string | null
  >(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [directionFilter, setDirectionFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] =
    useState<InvoiceData | null>(null);
  const [invoiceDetails, setInvoiceDetails] = useState<any>(null);

  const pageSize = 10;

  // Get clients for filter dropdown
  const { data: clients = [] } = useQuery({
    queryKey: ["clients"],
    queryFn: () => getClients(),
  });

  // Get invoices
  const { data: invoicesData, isLoading } = useQuery({
    queryKey: [
      "invoices",
      currentPage,
      clientFilter,
      dateFrom,
      dateTo,
      typeFilter,
      directionFilter,
    ],
    queryFn: () =>
      getInvoices({
        data: {
          page: currentPage,
          limit: pageSize,
          clientFilter: clientFilter === "all" ? undefined : clientFilter,
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
          typeFilter: typeFilter === "all" ? undefined : typeFilter,
          directionFilter: directionFilter === "all" ? undefined : directionFilter,
        },
      }),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => {
      toast.success("Factura eliminada correctamente");
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setDeleteDialogOpen(false);
      setInvoiceToDelete(null);
    },
    onError: (error) => {
      toast.error("Error al eliminar la factura");
      console.error(error);
    },
  });

  // View invoice details
  const handleViewInvoice = async (invoice: InvoiceData) => {
    setSelectedInvoice(invoice);
    setViewDialogOpen(true);

    try {
      const details = await getInvoice({ id: invoice.id });
      setInvoiceDetails(details);
    } catch (error) {
      toast.error("Error al cargar los detalles de la factura");
      console.error(error);
    }
  };

  const handleDeleteClick = (id: string) => {
    setInvoiceToDelete(id);
    setDeleteDialogOpen(true);
  };

  const handleDeleteConfirm = () => {
    if (invoiceToDelete) {
      deleteMutation.mutate({ id: invoiceToDelete });
    }
  };

  const handleDownloadAttachment = (url: string, filename: string) => {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-ES", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const formatCurrency = (amount: string, currency: string) => {
    const numAmount = parseFloat(amount);
    return new Intl.NumberFormat("es-ES", {
      style: "currency",
      currency: currency || "ARS",
    }).format(numAmount);
  };

  const getTypeBadge = (type: string) => {
    const typeMap: { [key: string]: { variant: "default" | "secondary" | "destructive" | "outline"; label: string } } = {
      "A": { variant: "default", label: "Factura A" },
      "B": { variant: "secondary", label: "Factura B" },
      "C": { variant: "outline", label: "Factura C" },
      "E": { variant: "destructive", label: "Factura E" },
    };
    
    const typeInfo = typeMap[type] || { variant: "outline" as const, label: type };
    return <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>;
  };

  const getDirectionBadge = (direction: string) => {
    const directionMap: { [key: string]: { variant: "default" | "secondary" | "destructive" | "outline"; label: string } } = {
      "input": { variant: "default", label: "Entrada" },
      "output": { variant: "secondary", label: "Salida" },
    };
    
    const directionInfo = directionMap[direction] || { variant: "outline" as const, label: direction };
    return <Badge variant={directionInfo.variant}>{directionInfo.label}</Badge>;
  };

  const totalPages = invoicesData?.totalPages || 1;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-col gap-2 md:flex-row md:items-center">
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar facturas..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 w-full md:w-64"
            />
          </div>

          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger className="w-full md:w-48">
              <SelectValue placeholder="Filtrar por cliente" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los clientes</SelectItem>
              {clients.map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-32">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="A">Factura A</SelectItem>
              <SelectItem value="B">Factura B</SelectItem>
              <SelectItem value="C">Factura C</SelectItem>
              <SelectItem value="E">Factura E</SelectItem>
            </SelectContent>
          </Select>

          <Select value={directionFilter} onValueChange={setDirectionFilter}>
            <SelectTrigger className="w-full md:w-32">
              <SelectValue placeholder="Dirección" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="input">Entrada</SelectItem>
              <SelectItem value="output">Salida</SelectItem>
            </SelectContent>
          </Select>

          <div className="flex gap-2">
            <Input
              type="date"
              placeholder="Fecha desde"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full md:w-40"
            />
            <Input
              type="date"
              placeholder="Fecha hasta"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full md:w-40"
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Tipo</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Emisor</TableHead>
              <TableHead>Destinatario</TableHead>
              <TableHead>Fecha Emisión</TableHead>
              <TableHead>Monto</TableHead>
              <TableHead>Dirección</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  Cargando facturas...
                </TableCell>
              </TableRow>
            ) : invoicesData?.invoices.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="h-24 text-center">
                  No se encontraron facturas.
                </TableCell>
              </TableRow>
            ) : (
              invoicesData?.invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>{getTypeBadge(invoice.type)}</TableCell>
                  <TableCell>
                    {invoice.clientName ? (
                      <div>
                        <div className="font-medium">
                          {invoice.clientName}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {invoice.clientEmail}
                        </div>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sin cliente</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{invoice.emitterName}</div>
                      <div className="text-sm text-muted-foreground">
                        {invoice.emitterIdentityType}: {invoice.emitterIdentityNumber}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="font-medium">{invoice.recipientName}</div>
                      <div className="text-sm text-muted-foreground">
                        {invoice.recipientIdentityType}: {invoice.recipientIdentityNumber}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {formatDate(invoice.emitionDate)}
                  </TableCell>
                  <TableCell className="font-medium">
                    {formatCurrency(invoice.amount, invoice.currency)}
                  </TableCell>
                  <TableCell>
                    {getDirectionBadge(invoice.direction)}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" className="h-8 w-8 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleViewInvoice(invoice)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Ver detalles
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDeleteClick(invoice.id)}
                          className="text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  className={
                    currentPage === 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                (page) => (
                  <PaginationItem key={page}>
                    <PaginationLink
                      onClick={() => setCurrentPage(page)}
                      isActive={currentPage === page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                )
              )}

              <PaginationItem>
                <PaginationNext
                  onClick={() =>
                    setCurrentPage(Math.min(totalPages, currentPage + 1))
                  }
                  className={
                    currentPage === totalPages
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}

      {/* View Invoice Dialog */}
      <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalles de la Factura</DialogTitle>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Tipo</label>
                  <p className="text-sm text-muted-foreground">
                    {getTypeBadge(selectedInvoice.type)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Dirección</label>
                  <p className="text-sm text-muted-foreground">
                    {getDirectionBadge(selectedInvoice.direction)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Fecha de Emisión</label>
                  <p className="text-sm text-muted-foreground">
                    {formatDate(selectedInvoice.emitionDate)}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">Monto Total</label>
                  <p className="text-sm font-medium">
                    {formatCurrency(selectedInvoice.amount, selectedInvoice.currency)}
                  </p>
                </div>
              </div>

              {/* Emitter Info */}
              <div>
                <h3 className="text-lg font-medium mb-3">Información del Emisor</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Nombre</label>
                    <p className="text-sm text-muted-foreground">
                      {selectedInvoice.emitterName}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Identificación</label>
                    <p className="text-sm text-muted-foreground">
                      {selectedInvoice.emitterIdentityType}: {selectedInvoice.emitterIdentityNumber}
                    </p>
                  </div>
                </div>
              </div>

              {/* Recipient Info */}
              <div>
                <h3 className="text-lg font-medium mb-3">Información del Destinatario</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium">Nombre</label>
                    <p className="text-sm text-muted-foreground">
                      {selectedInvoice.recipientName}
                    </p>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Identificación</label>
                    <p className="text-sm text-muted-foreground">
                      {selectedInvoice.recipientIdentityType}: {selectedInvoice.recipientIdentityNumber}
                    </p>
                  </div>
                </div>
              </div>

              {/* Client Info */}
              {selectedInvoice.clientName && (
                <div>
                  <h3 className="text-lg font-medium mb-3">Cliente Asociado</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Nombre</label>
                      <p className="text-sm text-muted-foreground">
                        {selectedInvoice.clientName}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Email</label>
                      <p className="text-sm text-muted-foreground">
                        {selectedInvoice.clientEmail}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Invoice Details */}
              {invoiceDetails && (
                <div>
                  <h3 className="text-lg font-medium mb-3">Detalles de la Factura</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium">Número de Autorización</label>
                      <p className="text-sm text-muted-foreground">
                        {invoiceDetails.authorizationNumber}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Punto de Venta</label>
                      <p className="text-sm text-muted-foreground">
                        {invoiceDetails.salePoint}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Rango de IDs</label>
                      <p className="text-sm text-muted-foreground">
                        {invoiceDetails.idFrom} - {invoiceDetails.idTo}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Moneda</label>
                      <p className="text-sm text-muted-foreground">
                        {invoiceDetails.currency} (Tasa: {invoiceDetails.currencyRate})
                      </p>
                    </div>
                  </div>

                  {/* Tax Breakdown */}
                  <div className="mt-4">
                    <h4 className="text-md font-medium mb-2">Desglose de Impuestos</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>Monto IVA 0%: {formatCurrency(invoiceDetails.amountIVA0, invoiceDetails.currency)}</div>
                      <div>IVA 2.5%: {formatCurrency(invoiceDetails.IVA25, invoiceDetails.currency)}</div>
                      <div>Monto IVA 2.5%: {formatCurrency(invoiceDetails.amountIVA25, invoiceDetails.currency)}</div>
                      <div>IVA 5%: {formatCurrency(invoiceDetails.IVA5, invoiceDetails.currency)}</div>
                      <div>Monto IVA 5%: {formatCurrency(invoiceDetails.amountIVA5, invoiceDetails.currency)}</div>
                      <div>IVA 10.5%: {formatCurrency(invoiceDetails.IVA105, invoiceDetails.currency)}</div>
                      <div>Monto IVA 10.5%: {formatCurrency(invoiceDetails.amountIVA105, invoiceDetails.currency)}</div>
                      <div>IVA 21%: {formatCurrency(invoiceDetails.IVA21, invoiceDetails.currency)}</div>
                      <div>Monto IVA 21%: {formatCurrency(invoiceDetails.amountIVA21, invoiceDetails.currency)}</div>
                      <div>IVA 27%: {formatCurrency(invoiceDetails.IVA27, invoiceDetails.currency)}</div>
                      <div>Monto IVA 27%: {formatCurrency(invoiceDetails.amountIVA27, invoiceDetails.currency)}</div>
                      <div>Total IVA: {formatCurrency(invoiceDetails.totalIVA, invoiceDetails.currency)}</div>
                      <div>Monto Gravado: {formatCurrency(invoiceDetails.amountTaxed, invoiceDetails.currency)}</div>
                      <div>Monto No Gravado: {formatCurrency(invoiceDetails.amountNoTaxed, invoiceDetails.currency)}</div>
                      <div>Monto Exento: {formatCurrency(invoiceDetails.amountExempt, invoiceDetails.currency)}</div>
                    </div>
                  </div>
                </div>
              )}

              {/* Attachments */}
              {invoiceDetails?.attachments &&
                invoiceDetails.attachments.length > 0 && (
                  <div>
                    <label className="text-sm font-medium">
                      Archivos Adjuntos
                    </label>
                    <div className="space-y-2 mt-2">
                      {invoiceDetails.attachments.map(
                        (attachment: any) => (
                          <div
                            key={attachment.id}
                            className="flex items-center justify-between p-3 border rounded-md"
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-muted-foreground" />
                              <div>
                                <p className="text-sm font-medium">
                                  {attachment.documentName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {attachment.documentType}
                                </p>
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleDownloadAttachment(
                                  attachment.documentUrl,
                                  attachment.documentName
                                )
                              }
                            >
                              <Download className="h-4 w-4 mr-2" />
                              Descargar
                            </Button>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará permanentemente la
              factura.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}






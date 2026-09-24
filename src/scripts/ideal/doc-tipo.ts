/**
 * Clasifica el documento de una contraparte para el catálogo `contraparte`.
 * No todo lo que viene de AFIP es un CUIT: las ventas a consumidor final
 * traen DNI, y en los datos históricos hay documentos incompletos.
 */
export function docTipo(raw: string | null): {
  doc_tipo: "cuit" | "dni" | "otro";
  doc_nro: string;
} {
  const n = (raw ?? "").replace(/\D/g, "");
  if (/^(20|23|24|27|30|33|34)\d{9}$/.test(n)) return { doc_tipo: "cuit", doc_nro: n };
  if (n.length >= 7 && n.length <= 8) return { doc_tipo: "dni", doc_nro: n };
  return { doc_tipo: "otro", doc_nro: n };
}

import { parse as parseCsv } from "csv-parse/sync";
import { stringify as stringifyCsv } from "csv-stringify/sync";

// Formato compartido por las importaciones/exportaciones de precios (listas de
// cliente y precios default del catálogo): matriz ancha, una fila por producto
// y una columna por unidad. El match en import es por `producto_id`; los headers
// de unidad se mapean contra el catálogo por nombre o abreviación.

export const COL_ID = "producto_id";
export const COL_NOMBRE = "producto";

export function sanitizarNombreArchivo(s: string): string {
  return (
    s
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "precios"
  );
}

/**
 * Normaliza un valor de celda a número, tolerando $, espacios y separadores es/us.
 * Heurística pensada para es-AR (punto = miles): un único separador seguido de
 * exactamente 1–2 dígitos se trata como decimal; cualquier otro caso es de miles.
 * Ej: "2.000" → 2000, "$ 1.500" → 1500, "1.234,56" → 1234.56, "1500,5" → 1500.5
 */
export function parsePrecioCelda(raw: string): number | null {
  const s = raw.trim().replace(/[^\d.,-]/g, "");
  if (s === "") return null;
  const tieneDot = s.includes(".");
  const tieneComa = s.includes(",");
  let normal = s;
  if (tieneDot && tieneComa) {
    // El último separador que aparece es el decimal; el otro es de miles.
    const sep = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const miles = sep === "," ? "." : ",";
    normal = s.split(miles).join("").replace(sep, ".");
  } else if (tieneDot || tieneComa) {
    const sep = tieneDot ? "." : ",";
    const partes = s.split(sep);
    const decimales = partes[partes.length - 1]!.length;
    normal = partes.length === 2 && decimales <= 2 ? partes.join(".") : partes.join("");
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : NaN;
}

export interface ProductoMin {
  id: number;
  nombre: string;
}
export interface UnidadMin {
  id: number;
  nombre: string;
  abreviacion?: string | null;
}
export interface PrecioMin {
  producto_id: number;
  unidad_id: number;
  precio: { toString(): string };
}

/** Arma el CSV de exportación (con BOM UTF-8) a partir del catálogo y los precios activos. */
export function construirCsvExport(
  productos: ProductoMin[],
  unidades: UnidadMin[],
  precios: PrecioMin[],
): string {
  const mapa = new Map<number, Map<number, string>>();
  for (const p of precios) {
    if (!mapa.has(p.producto_id)) mapa.set(p.producto_id, new Map());
    mapa.get(p.producto_id)!.set(p.unidad_id, p.precio.toString());
  }

  const header = [COL_ID, COL_NOMBRE, ...unidades.map((u) => u.nombre)];
  const filas = productos.map((prod) => {
    const porUnidad = mapa.get(prod.id);
    return [String(prod.id), prod.nombre, ...unidades.map((u) => porUnidad?.get(u.id) ?? "")];
  });

  return "﻿" + stringifyCsv([header, ...filas]); // BOM para que Sheets/Excel respeten UTF-8
}

export interface CambioPrecio {
  producto_id: number;
  unidad_id: number;
  precio: number;
}
export interface ParPrecio {
  producto_id: number;
  unidad_id: number;
}

export type AnalisisImport =
  | { ok: false; status: number; error: string; errores?: string[] }
  | {
      ok: true;
      crear: CambioPrecio[];
      actualizar: CambioPrecio[];
      eliminar: ParPrecio[];
      sin_cambios: number;
    };

/**
 * Parsea y valida un CSV de import contra el catálogo. NO escribe nada: devuelve
 * las acciones categorizadas, o un error (atómico: si hay cualquier problema se
 * aborta sin acciones). El que llama hace la escritura sobre su propio modelo.
 *
 * @param activos producto_id → unidad_id → precio activo actual (solo precios no nulos)
 */
export function analizarImport(
  contenido: string,
  productoIds: Set<number>,
  unidades: UnidadMin[],
  activos: Map<number, Map<number, number>>,
): AnalisisImport {
  if (typeof contenido !== "string" || contenido.trim() === "") {
    return { ok: false, status: 400, error: "El archivo está vacío o no se pudo leer" };
  }

  let registros: string[][];
  try {
    registros = parseCsv(contenido, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    });
  } catch {
    return { ok: false, status: 400, error: "No se pudo parsear el archivo CSV" };
  }

  if (registros.length < 2) {
    return { ok: false, status: 400, error: "El archivo no tiene filas de datos" };
  }

  const header = registros[0]!.map((h) => h.trim());
  if ((header[0] ?? "").toLowerCase() !== COL_ID || (header[1] ?? "").toLowerCase() !== COL_NOMBRE) {
    return {
      ok: false,
      status: 400,
      error: `Encabezados inválidos: la primera columna debe ser "${COL_ID}" y la segunda "${COL_NOMBRE}". Exportá para obtener el formato correcto.`,
    };
  }

  const unidadPorNombre = new Map<string, number>();
  for (const u of unidades) {
    unidadPorNombre.set(u.nombre.trim().toLowerCase(), u.id);
    if (u.abreviacion) unidadPorNombre.set(u.abreviacion.trim().toLowerCase(), u.id);
  }

  const errores: string[] = [];

  // Mapear cada columna de header (desde la 3.ª) a una unidad.
  const colUnidad: (number | null)[] = header.map((h, i) => {
    if (i < 2) return null;
    const id = unidadPorNombre.get(h.toLowerCase());
    if (id === undefined) errores.push(`Encabezado de unidad desconocido: "${h}" (columna ${i + 1})`);
    return id ?? null;
  });

  const crear: CambioPrecio[] = [];
  const actualizar: CambioPrecio[] = [];
  const eliminar: ParPrecio[] = [];
  let sin_cambios = 0;

  for (let r = 1; r < registros.length; r++) {
    const fila = registros[r]!;
    const nroFila = r + 1; // 1-based, contando el header
    const idRaw = (fila[0] ?? "").trim();
    if (idRaw === "") continue; // fila sin producto → se ignora
    const producto_id = Number(idRaw);
    if (!Number.isInteger(producto_id) || !productoIds.has(producto_id)) {
      errores.push(`Fila ${nroFila}: producto_id "${idRaw}" inexistente o inválido`);
      continue;
    }

    for (let c = 2; c < header.length; c++) {
      const unidad_id = colUnidad[c];
      if (unidad_id === null) continue; // header inválido ya reportado
      const celda = (fila[c] ?? "").trim();
      const activoPrecio = activos.get(producto_id)?.get(unidad_id);

      if (celda === "") {
        if (activoPrecio !== undefined) eliminar.push({ producto_id, unidad_id });
        continue;
      }

      const precio = parsePrecioCelda(celda);
      if (precio === null || !Number.isFinite(precio) || precio < 0) {
        errores.push(`Fila ${nroFila}, columna "${header[c]}": valor inválido "${celda}"`);
        continue;
      }

      if (activoPrecio === undefined) {
        crear.push({ producto_id, unidad_id, precio });
      } else if (activoPrecio !== precio) {
        actualizar.push({ producto_id, unidad_id, precio });
      } else {
        sin_cambios++;
      }
    }
  }

  if (errores.length > 0) {
    return { ok: false, status: 400, error: "El archivo tiene errores y no se importó nada", errores };
  }

  return { ok: true, crear, actualizar, eliminar, sin_cambios };
}

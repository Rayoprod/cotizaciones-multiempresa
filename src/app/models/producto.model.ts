export interface IProducto {
  id?: string; // Es opcional porque al crear uno nuevo aún no tiene ID
  codigo_sku: string;
  descripcion: string;
  unidad: string;
  precio_unitario_base: number | null; // Null para cuando el formulario está vacío
}
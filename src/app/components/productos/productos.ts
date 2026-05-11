import { Component, OnInit, ChangeDetectorRef, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { ToolbarModule } from 'primeng/toolbar';

import { SupabaseService } from '../../services/supabase.service';
import { IProducto } from '../../models/producto.model';

import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TableModule, ButtonModule,
    InputTextModule, InputNumberModule, DialogModule, ToolbarModule,
    TagModule, TooltipModule, ProgressSpinnerModule, ToastModule
  ],
  providers: [MessageService],
  templateUrl: './productos.html'
})
export class ProductosComponent implements OnInit {

  productos: IProducto[] = [];
  cargando = signal(true);
  productoDialog = signal(false);               // ← ahora es signal
  productoActual: IProducto = this.productoVacio();
  productoOriginal: string = '';
  enviando: boolean = false;
  empresaActiva: any;

  constructor(
    private supabaseSvc: SupabaseService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService
  ) {}

  async ngOnInit() {
    const datos = sessionStorage.getItem('empresa_activa');
    this.empresaActiva = datos ? JSON.parse(datos) : null;
    await this.cargarProductos();
  }

  async cargarProductos() {
    if (!this.empresaActiva?.id) return;
    this.cargando.set(true);
    try {
      this.productos = await this.supabaseSvc.getProductos(this.empresaActiva.id) as IProducto[];
    } catch (error) {
      console.error('Error al cargar productos:', error);
    } finally {
      this.cargando.set(false);
      this.cdr.detectChanges();
    }
  }

  get precioPromedio(): number {
    if (this.productos.length === 0) return 0;
    const total = this.productos.reduce((sum, p) => sum + (p.precio_unitario_base || 0), 0);
    return total / this.productos.length;
  }

  get unidadesUnicas(): number {
    return new Set(this.productos.map(p => p.unidad).filter(Boolean)).size;
  }

  generarSkuAutomatico(): string {
    const cantidad = this.productos.length;
    return `PRD-${(cantidad + 1).toString().padStart(4, '0')}`;
  }

  abrirNuevo() {
    this.productoActual = {
      ...this.productoVacio(),
      codigo_sku: this.generarSkuAutomatico()
    };
    this.productoOriginal = JSON.stringify(this.productoActual);
    this.enviando = false;
    this.productoDialog.set(true);               // ← signal
  }

  editarProducto(producto: IProducto) {
    this.productoActual = { ...producto };
    this.productoOriginal = JSON.stringify(this.productoActual);
    this.productoDialog.set(true);               // ← signal
  }

  async borrarProducto(producto: IProducto) {
    if (confirm(`¿Estás seguro de eliminar "${producto.descripcion}"?`)) {
      try {
        if (producto.id) {
          await this.supabaseSvc.eliminarProducto(producto.id);
          await this.cargarProductos();
        }
      } catch (error) {
        console.error('Error al eliminar:', error);
        this.messageService.add({
          severity: 'error',
          summary: 'Error al eliminar',
          detail: 'Hubo un error al eliminar el producto.'
        });
      }
    }
  }

  async guardarProducto() {
    if (!this.productoActual.descripcion || this.productoActual.precio_unitario_base === null) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Campos obligatorios',
        detail: 'La descripción y el precio son obligatorios.'
      });
      return;
    }

    const skuDuplicado = this.productos.some(
      p => p.codigo_sku === this.productoActual.codigo_sku && p.id !== this.productoActual.id
    );

    if (skuDuplicado) {
      this.messageService.add({
        severity: 'warn',
        summary: 'SKU duplicado',
        detail: `El código SKU "${this.productoActual.codigo_sku}" ya existe.`
      });
      return;
    }

    if (this.productoOriginal === JSON.stringify(this.productoActual)) {
      this.productoDialog.set(false);            // ← signal
      return;
    }

    this.enviando = true;
    try {
      const payload = { ...this.productoActual, empresa_id: this.empresaActiva.id };
      await this.supabaseSvc.guardarProducto(payload);
      this.productoDialog.set(false);            // ← signal
      await this.cargarProductos();
    } catch (error) {
      console.error('Error al guardar:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error al guardar',
        detail: 'Hubo un error al comunicarse con la base de datos.'
      });
    } finally {
      this.enviando = false;
    }
  }

  ocultarDialog() {
    this.productoDialog.set(false);              // ← signal
    this.enviando = false;
  }

  private productoVacio(): IProducto {
    return { codigo_sku: '', descripcion: '', unidad: 'm3', precio_unitario_base: null };
  }
}
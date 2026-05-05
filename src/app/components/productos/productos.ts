import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
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

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TableModule, ButtonModule,
    InputTextModule, InputNumberModule, DialogModule, ToolbarModule,
    TagModule, TooltipModule
  ],
  templateUrl: './productos.html'
})
export class ProductosComponent implements OnInit {

  productos: IProducto[] = [];
  productoDialog: boolean = false;
  productoActual: IProducto = this.productoVacio();
  productoOriginal: string = '';
  enviando: boolean = false;
  empresaActiva: any;

  constructor(
    private supabaseSvc: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    const datos = sessionStorage.getItem('empresa_activa');
    this.empresaActiva = datos ? JSON.parse(datos) : null;
    await this.cargarProductos();
  }

  async cargarProductos() {
    if (!this.empresaActiva?.id) return;
    try {
      this.productos = await this.supabaseSvc.getProductos(this.empresaActiva.id) as IProducto[];
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error al cargar productos:', error);
    }
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
    this.productoDialog = true;
  }

  editarProducto(producto: IProducto) {
    this.productoActual = { ...producto };
    this.productoOriginal = JSON.stringify(this.productoActual);
    this.productoDialog = true;
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
        alert('Hubo un error al eliminar el producto.');
      }
    }
  }

  async guardarProducto() {
    if (!this.productoActual.descripcion || this.productoActual.precio_unitario_base === null) {
      alert('La descripción y el precio son obligatorios.');
      return;
    }

    const skuDuplicado = this.productos.some(
      p => p.codigo_sku === this.productoActual.codigo_sku && p.id !== this.productoActual.id
    );

    if (skuDuplicado) {
      alert(`El código SKU "${this.productoActual.codigo_sku}" ya existe.`);
      return;
    }

    if (this.productoOriginal === JSON.stringify(this.productoActual)) {
      this.productoDialog = false;
      return;
    }

    this.enviando = true;
    try {
      const payload = { ...this.productoActual, empresa_id: this.empresaActiva.id };
      await this.supabaseSvc.guardarProducto(payload);
      this.productoDialog = false;
      await this.cargarProductos();
    } catch (error) {
      console.error('Error al guardar:', error);
      alert('Hubo un error al comunicarse con la base de datos.');
    } finally {
      this.enviando = false;
    }
  }

  ocultarDialog() {
    this.productoDialog = false;
    this.enviando = false;
  }

  private productoVacio(): IProducto {
    return { codigo_sku: '', descripcion: '', unidad: 'm3', precio_unitario_base: null };
  }
}
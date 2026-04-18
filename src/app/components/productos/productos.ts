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
import { IProducto } from '../../models/producto.model'; // <-- Importamos el molde estricto

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TableModule, ButtonModule, 
    InputTextModule, InputNumberModule, DialogModule, ToolbarModule
  ],
  templateUrl: './productos.html'
})
export class ProductosComponent implements OnInit {
  
  // ¡Adiós any[]! Ahora es estrictamente un arreglo de IProducto
  productos: IProducto[] = [];
  
  productoDialog: boolean = false;
  
  // Inicializamos con la estructura correcta
  productoActual: IProducto = { codigo_sku: '', descripcion: '', unidad: 'm3', precio_unitario_base: null };
  
  productoOriginal: string = ''; // Para comparar si hubo cambios
  enviando: boolean = false;

  constructor(
    private supabaseSvc: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.cargarProductos();
  }

  async cargarProductos() {
    try {
      // Casteamos la respuesta de Supabase a nuestro tipo IProducto[]
      this.productos = await this.supabaseSvc.getProductos() as IProducto[];
      this.cdr.detectChanges();
    } catch (error) {
      console.error("Error al cargar productos:", error);
    }
  }

  // Lógica: PRD-0001, PRD-0002...
  generarSkuAutomatico(): string {
    const cantidad = this.productos.length;
    return `PRD-${(cantidad + 1).toString().padStart(4, '0')}`;
  }

  abrirNuevo() {
    this.productoActual = { 
      codigo_sku: this.generarSkuAutomatico(), 
      descripcion: '', 
      unidad: 'm3', 
      precio_unitario_base: null 
    };
    this.productoOriginal = JSON.stringify(this.productoActual);
    this.enviando = false;
    this.productoDialog = true;
  }

  // Recibe estrictamente un IProducto
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
        console.error("Error al eliminar", error);
        alert("Hubo un error al eliminar el producto.");
      }
    }
  }

  async guardarProducto() {
    // 1. Validaciones
    if (!this.productoActual.descripcion || this.productoActual.precio_unitario_base === null) {
      alert("La descripción y el precio son obligatorios.");
      return;
    }

    // 2. Evitar SKU duplicados
    const skuDuplicado = this.productos.some(p => 
      p.codigo_sku === this.productoActual.codigo_sku && p.id !== this.productoActual.id
    );

    if (skuDuplicado) {
      alert(`El código SKU "${this.productoActual.codigo_sku}" ya existe en el sistema.`);
      return;
    }

    // 3. Detección de cambios puros
    if (this.productoOriginal === JSON.stringify(this.productoActual)) {
      console.log("Actualización forzada: No se detectaron cambios en los datos.");
      // Como es actualización forzada, simplemente cerramos para no gastar una llamada a internet en vano.
      // Si quisieras guardarlo de todos modos, solo comenta el "return".
      this.productoDialog = false;
      return; 
    }

    this.enviando = true;
    try {
      await this.supabaseSvc.guardarProducto(this.productoActual);
      this.productoDialog = false;
      await this.cargarProductos(); 
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Hubo un error al comunicarse con la base de datos.");
    } finally {
      this.enviando = false;
    }
  }

  ocultarDialog() {
    this.productoDialog = false;
    this.enviando = false;
  }
}
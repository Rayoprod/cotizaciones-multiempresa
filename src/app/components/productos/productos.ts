import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { DialogModule } from 'primeng/dialog';
import { ToolbarModule } from 'primeng/toolbar';

import { SupabaseService } from '../../services/supabase.service';
import { IProducto} from '../../models';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { SessionContextService } from '../../services/session-context.service';

import { InputTextareaModule } from 'primeng/inputtextarea';

@Component({
  selector: 'app-productos',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TableModule, ButtonModule,
    InputTextModule, InputNumberModule, InputTextareaModule, DialogModule, ToolbarModule,
    TagModule, TooltipModule, ProgressSpinnerModule, ToastModule, ConfirmDialogModule
  ],
  providers: [MessageService, ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './productos.html'
})
export class ProductosComponent implements OnInit {

  productos: IProducto[] = [];
  cargando = true;
  productoDialog = false;
  productoActual: IProducto = this.productoVacio();
  productoOriginal: string = '';
  enviando: boolean = false;
  empresaActiva: any;

  constructor(
    private supabaseSvc: SupabaseService,
    private session: SessionContextService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  async ngOnInit() {
    this.empresaActiva = this.session.empresaActiva();
    await this.cargarProductos();
  }

  async cargarProductos() {
    const empresa = this.empresaActiva || this.session.empresaActiva();
    if (!empresa?.id) return;
    this.empresaActiva = empresa;
    this.cargando = true;
    try {
      this.productos = await this.supabaseSvc.getProductos(empresa.id) as IProducto[];
    } catch (error) {
      console.error('Error al cargar productos:', error);
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
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
    const numeros = this.productos
      .map(p => p.codigo_sku)
      .filter(Boolean)
      .map(sku => {
        const match = (sku || '').match(/PRD-(\d+)/i);
        return match ? parseInt(match[1], 10) : 0;
      });
    const maxNum = numeros.length > 0 ? Math.max(...numeros) : 0;
    let siguiente = maxNum + 1;
    let skuCandidate = `PRD-${siguiente.toString().padStart(4, '0')}`;
    while (this.productos.some(p => (p.codigo_sku || '').trim().toLowerCase() === skuCandidate.toLowerCase())) {
      siguiente++;
      skuCandidate = `PRD-${siguiente.toString().padStart(4, '0')}`;
    }
    return skuCandidate;
  }

  abrirNuevo() {
    const empresa = this.empresaActiva || this.session.empresaActiva();
    if (!empresa?.id) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Empresa no seleccionada',
        detail: 'Por favor selecciona una empresa activa.'
      });
      return;
    }
    this.empresaActiva = empresa;
    this.productoActual = {
      ...this.productoVacio(),
      codigo_sku: this.generarSkuAutomatico(),
      empresa_id: empresa.id
    };
    delete (this.productoActual as any).id;
    this.productoOriginal = JSON.stringify(this.productoActual);
    this.enviando = false;
    this.productoDialog = true;
  }

  editarProducto(producto: IProducto) {
    this.productoActual = { ...producto };
    this.productoOriginal = JSON.stringify(this.productoActual);
    this.productoDialog = true;
  }

  confirmarBorrarProducto(producto: IProducto) {
    this.confirmationService.confirm({
      message: `¿Estás seguro de eliminar "${producto.descripcion}"?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger border-round-xl',
      rejectButtonStyleClass: 'p-button-outlined border-round-xl',
      accept: () => this.borrarProducto(producto)
    });
  }

  async borrarProducto(producto: IProducto) {
    try {
      if (producto.id) {
        await this.supabaseSvc.eliminarProducto(producto.id);
        this.messageService.add({
          severity: 'success',
          summary: 'Eliminado',
          detail: 'Producto eliminado correctamente.'
        });
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

  async guardarProducto() {
    const empresa = this.empresaActiva || this.session.empresaActiva();
    if (!empresa?.id) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Empresa no seleccionada',
        detail: 'Por favor selecciona una empresa activa.'
      });
      return;
    }
    this.empresaActiva = empresa;

    const descTrim = (this.productoActual.descripcion || '').trim();
    const precio = this.productoActual.precio_unitario_base;

    if (!descTrim || precio === null || precio === undefined || isNaN(Number(precio)) || Number(precio) < 0) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Campos obligatorios',
        detail: 'La descripción y un precio unitario válido son obligatorios.'
      });
      return;
    }

    const skuActual = (this.productoActual.codigo_sku || '').trim();
    if (skuActual) {
      const skuDuplicado = this.productos.some(
        p => (p.codigo_sku || '').trim().toLowerCase() === skuActual.toLowerCase() && p.id !== this.productoActual.id
      );

      if (skuDuplicado) {
        this.messageService.add({
          severity: 'warn',
          summary: 'SKU duplicado',
          detail: `El código SKU "${skuActual}" ya existe.`
        });
        return;
      }
    }

    this.enviando = true;
    try {
      const payload: IProducto = {
        ...this.productoActual,
        codigo_sku: skuActual || this.generarSkuAutomatico(),
        descripcion: descTrim,
        unidad: (this.productoActual.unidad || '').trim() || 'm3',
        precio_unitario_base: Number(precio),
        empresa_id: empresa.id
      };

      if (!payload.id || String(payload.id).trim() === '') {
        delete (payload as any).id;
      }

      await this.supabaseSvc.guardarProducto(payload);
      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Producto guardado correctamente.'
      });
      this.productoDialog = false;
      await this.cargarProductos();
    } catch (error: any) {
      console.error('Error al guardar producto:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error al guardar',
        detail: error?.message || 'Hubo un error al comunicarse con la base de datos.'
      });
    } finally {
      this.enviando = false;
      this.cdr.markForCheck();
    }
  }

  ocultarDialog() {
    this.productoDialog = false;
    this.enviando = false;
    this.productoActual = this.productoVacio();
    this.productoOriginal = JSON.stringify(this.productoActual);
  }

  private productoVacio(): IProducto {
    return { codigo_sku: '', descripcion: '', unidad: 'm3', precio_unitario_base: 0, empresa_id: '' };
  }
}
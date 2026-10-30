import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ICotizacion, IDatosVenta, IVenta, datosVentaIniciales, esDocumentoValido, faltantesDatosVenta, soles } from '../../models';
import { SupabaseService } from '../../services/supabase.service';
import { DatosVentaComponent } from './datos-venta';

/** Lo vendido es lo cotizado: aquí solo se pregunta lo que la cotización no dice. */
@Component({
  selector: 'app-dialogo-convertir',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonModule, DialogModule, InputTextModule, DatosVentaComponent],
  templateUrl: './dialogo-convertir.html',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DialogoConvertirComponent {
  @Output() convertida = new EventEmitter<IVenta>();

  readonly soles = soles;
  abierto = false;
  /** Se conserva al cerrar: si no, la ventana se vería vacía mientras se va. */
  cotizacion: ICotizacion | null = null;
  datos: IDatosVenta = datosVentaIniciales();
  /** Solo se pide si la cotización no tiene un RUC o DNI válido. */
  documento = '';
  guardando = false;
  mostrarFaltantes = false;

  constructor(
    private supabase: SupabaseService,
    private msg: MessageService,
    private cdr: ChangeDetectorRef
  ) {}

  abrir(cotizacion: ICotizacion) {
    this.cotizacion = cotizacion;
    this.abierto = true;
    this.datos = datosVentaIniciales();
    this.documento = '';
    this.mostrarFaltantes = false;
    this.cdr.markForCheck();
  }

  cerrar() {
    this.abierto = false;
    this.cdr.markForCheck();
  }

  get necesitaDocumento(): boolean {
    return !!this.cotizacion && !esDocumentoValido(this.cotizacion.cliente_documento);
  }

  get faltantes(): string[] {
    if (!this.cotizacion) return [];
    const falta = faltantesDatosVenta(this.datos, this.cotizacion.total);
    if (this.necesitaDocumento && !esDocumentoValido(this.documento)) falta.unshift('un RUC de 11 dígitos o un DNI de 8');
    return falta;
  }

  async convertir() {
    if (!this.cotizacion?.id || this.guardando) return;
    if (this.faltantes.length) {
      this.mostrarFaltantes = true;
      return;
    }
    this.guardando = true;
    try {
      const venta = await this.supabase.convertirCotizacionEnVenta(
        this.cotizacion.id, this.datos, this.necesitaDocumento ? this.documento.trim() : null
      );
      this.abierto = false;
      this.convertida.emit(venta);
    } catch (e: any) {
      console.error('Error al convertir en venta:', e);
      this.msg.add({
        severity: 'error', summary: 'No se registró la venta', life: 8000,
        detail: ['22023', 'P0001', '42501'].includes(e?.code) && e?.message ? e.message : 'Revisa tu conexión e inténtalo de nuevo.'
      });
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }
}

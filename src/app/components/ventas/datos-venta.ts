import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { CondicionPago, EstadoEntrega, IDatosVenta, METODOS_PAGO, fechaCorta, fechaDeCotizacion, fechaIso } from '../../models';

/** Fecha, pago y entrega de una venta: en el cotizador y al convertir una cotización. */
@Component({
  selector: 'app-datos-venta',
  standalone: true,
  imports: [CommonModule, FormsModule, InputNumberModule, InputTextModule],
  templateUrl: './datos-venta.html',
  styleUrl: './datos-venta.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DatosVentaComponent {
  @Input({ required: true }) datos!: IDatosVenta;
  @Input() total = 0;
  /** Al ajustar una venta, los pagos y la entrega se manejan desde la venta. */
  @Input() soloCondiciones = false;
  /** Para los id de los campos: este formulario puede estar dos veces en la app. */
  @Input() prefijo = 'venta';
  @Output() cambio = new EventEmitter<void>();

  readonly hoy = fechaIso();
  readonly metodos = METODOS_PAGO;
  readonly condicionesPago: Array<{ value: CondicionPago; label: string }> = [
    { value: 'CONTADO', label: 'Contado' },
    { value: 'CREDITO', label: 'Crédito' }
  ];
  readonly entregas: Array<{ value: EstadoEntrega; label: string }> = [
    { value: 'PENDIENTE', label: 'Por entregar' },
    { value: 'ENTREGADA', label: 'Ya entregada' }
  ];

  elegirCondicion(condicion: CondicionPago) {
    this.datos.condicionPago = condicion;
    if (condicion === 'CONTADO') this.datos.diasCredito = null;
    this.cambio.emit();
  }

  elegirEntrega(estado: EstadoEntrega) {
    this.datos.estadoEntrega = estado;
    this.cambio.emit();
  }

  recibirTodo() {
    this.datos.adelantoMonto = this.total;
    this.cambio.emit();
  }

  get hayAdelanto(): boolean {
    return (this.datos.adelantoMonto ?? 0) > 0;
  }

  /** La fecha que resulta de los días de crédito, para verla antes de guardar. */
  get venceEl(): string | null {
    const dias = this.datos.diasCredito;
    if (!this.datos.fecha || !dias) return null;
    const vence = fechaDeCotizacion(this.datos.fecha);
    vence.setDate(vence.getDate() + dias);
    return fechaCorta(fechaIso(vence));
  }
}

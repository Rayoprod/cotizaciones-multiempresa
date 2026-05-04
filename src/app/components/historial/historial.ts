import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';

import { ICotizacion } from '../../models/cotizacion.model';
import { SupabaseService } from '../../services/supabase.service';
import { PdfService } from '../../services/pdf.service';

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    TableModule, ButtonModule, TagModule,
    InputTextModule, SelectModule, ToastModule
  ],
  providers: [MessageService],
  templateUrl: './historial.html'
})
export class HistorialComponent implements OnInit {

  cotizaciones: ICotizacion[] = [];
  empresasBD:   any[]         = [];
  empresaActiva: any          = null;
  descargando:  string | null = null;   // id de la cotización descargándose

  opcionesEstado = [
    { label: 'PENDIENTE', value: 'PENDIENTE' },
    { label: 'APROBADA',  value: 'APROBADA'  },
    { label: 'ANULADA',   value: 'ANULADA'   }
  ];

  constructor(
    private supabaseSvc: SupabaseService,
    private pdfSvc:      PdfService,
    private msg:         MessageService,
    private cdr:         ChangeDetectorRef
  ) {}

  async ngOnInit() {
    // FIX: localStorage bloqueado → leer empresa desde Supabase session
    try {
      this.empresasBD   = await this.supabaseSvc.getEmpresas();
      const empresas    = await this.supabaseSvc.getEmpresasDelUsuario();
      this.empresaActiva = empresas?.[0] ?? null;

      this.cotizaciones = await this.supabaseSvc.getHistorial(this.empresaActiva?.id);
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error cargando historial:', error);
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el historial' });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getSeverity(estado: string): 'success' | 'secondary' | 'info' | 'warn' | 'danger' | 'contrast' {
  switch (estado) {
    case 'APROBADA':  return 'success';
    case 'PENDIENTE': return 'warn';
    case 'ANULADA':   return 'danger';
    default:          return 'info';
  }
}

  getNombreEmpresa(empresaId: string): string {
    return this.empresasBD.find(e => e.id === empresaId)?.nombre_comercial ?? empresaId;
  }

  // ── Cambiar estado ────────────────────────────────────────────────────────

  async cambiarEstado(cotizacion: any) {
    try {
      if (!cotizacion.id) return;
      await this.supabaseSvc.actualizarEstado(cotizacion.id, cotizacion.estado);
      this.msg.add({ severity: 'success', summary: 'Estado actualizado', detail: `${cotizacion.folio} → ${cotizacion.estado}` });
    } catch (error) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo actualizar el estado' });
    }
  }

  // ── Descargar PDF ─────────────────────────────────────────────────────────

  async descargarPDF(cotizacion: any) {
    const empresaData = this.empresasBD.find(e => e.id === cotizacion.empresa_id);
    if (!empresaData) {
      this.msg.add({ severity: 'warn', summary: 'Sin datos', detail: 'No se encontró la empresa de esta cotización' });
      return;
    }

    this.descargando = cotizacion.id;
    try {
      // FIX: pasar objeto condiciones en vez de string observaciones
      await this.pdfSvc.generarYDescargarCotizacion(
        cotizacion,
        empresaData,
        cotizacion.lugar_entrega ?? '',
        {
          mostrarValidez:       true,
          diasValidez:          '15',
          mostrarCuentas:       empresaData.mostrar_cuentas ?? true,
          mostrarContacto:      !(empresaData.mostrar_cuentas ?? true),
          mostrarObservaciones: !!cotizacion.observaciones,
          observaciones:        cotizacion.observaciones ?? ''
        }
      );
    } catch (e) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo generar el PDF' });
    } finally {
      this.descargando = null;
    }
  }
}
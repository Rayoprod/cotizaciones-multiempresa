import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG
import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select'; // <-- ¡AQUÍ ESTÁ LA MAGIA!

import { ICotizacion } from '../../models/cotizacion.model';
import { SupabaseService } from '../../services/supabase.service';
import { PdfService } from '../../services/pdf.service';

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, ButtonModule, TagModule, InputTextModule, SelectModule],
  templateUrl: './historial.html'
})
export class HistorialComponent implements OnInit {
  cotizaciones: ICotizacion[] = [];
  
  opcionesEstado = [
    { label: 'PENDIENTE', value: 'PENDIENTE' },
    { label: 'APROBADA', value: 'APROBADA' },
    { label: 'ANULADA', value: 'ANULADA' }
  ];

  constructor(
    private supabaseSvc: SupabaseService,
    private pdfSvc: PdfService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.cargarHistorial();
  }

  async cargarHistorial() {
    try {
      this.cotizaciones = await this.supabaseSvc.getHistorial();
      this.cdr.detectChanges();
    } catch (error) {
      console.error("Error cargando historial:", error);
    }
  }

  getSeverity(estado: string) {
    switch (estado) {
      case 'APROBADA': return 'success';
      case 'PENDIENTE': return 'warn';
      case 'ANULADA': return 'danger';
      default: return 'info';
    }
  }

  async cambiarEstado(cotizacion: any) {
    try {
      if (!cotizacion.id) return;
      await this.supabaseSvc.actualizarEstado(cotizacion.id, cotizacion.estado);
      console.log(`Cotización ${cotizacion.folio} actualizada a ${cotizacion.estado}`);
    } catch (error) {
      console.error("Error al actualizar estado", error);
      alert("Hubo un error al guardar el nuevo estado.");
    }
  }

  async descargarPDF(cotizacion: ICotizacion) {
    await this.pdfSvc.generarYDescargarCotizacion(cotizacion);
  }
}
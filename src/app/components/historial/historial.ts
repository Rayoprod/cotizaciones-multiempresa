import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select'; 

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
  empresasBD: any[] = []; // <-- Nueva variable para guardar las empresas

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
    try {
      // Cargamos el historial Y las empresas para poder dibujar los PDFs
      this.empresasBD = await this.supabaseSvc.getEmpresas();
      this.cotizaciones = await this.supabaseSvc.getHistorial();
      this.cdr.detectChanges();
    } catch (error) {
      console.error("Error cargando datos:", error);
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
    } catch (error) {
      alert("Hubo un error al guardar el nuevo estado.");
    }
  }

  async descargarPDF(cotizacion: any) {
    // 1. Buscamos a qué empresa pertenece esta cotización
    const idBuscado = cotizacion.empresa === 'W&M' ? 'WM' : cotizacion.empresa;
    const empresaData = this.empresasBD.find(e => e.id === idBuscado);

    if (!empresaData) {
      alert("No se encontraron los datos de la empresa para este PDF.");
      return;
    }

    // 2. Le mandamos el paquete completo al creador de PDFs
    await this.pdfSvc.generarYDescargarCotizacion(cotizacion, empresaData, cotizacion.lugar_entrega, cotizacion.observaciones);
  }
}
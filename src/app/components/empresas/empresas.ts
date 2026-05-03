import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToolbarModule } from 'primeng/toolbar';
import { ColorPickerModule } from 'primeng/colorpicker';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ToastModule } from 'primeng/toast'; // <-- FALTABA ESTO

import { SupabaseService } from '../../services/supabase.service';
import { IEmpresa } from '../../models/empresa.model';
import { MessageService } from 'primeng/api';

@Component({
  selector: 'app-empresas',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TableModule, ButtonModule, 
    InputTextModule, DialogModule, ToolbarModule, ColorPickerModule, ToggleSwitchModule, ToastModule
  ],
  providers: [MessageService],
  templateUrl: './empresas.html'
})
export class EmpresasComponent implements OnInit {
  
  empresas: IEmpresa[] = [];
  empresaDialog: boolean = false;
  empresaActual: any = {};
  enviando: boolean = false;
  
  // 🔥 EL DETECTIVE: Nos dirá si estamos creando o actualizando
  esEdicion: boolean = false; 

  constructor(
    private supabaseSvc: SupabaseService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService
  ) {}

  async ngOnInit() {
    await this.cargarEmpresas();
  }

  async cargarEmpresas() {
    try {
      this.empresas = await this.supabaseSvc.getEmpresas();
      this.cdr.detectChanges();
    } catch (error) {
      console.error("Error al cargar empresas:", error);
    }
  }

  abrirNuevo() {
    this.esEdicion = false; // Avisamos que es nueva
    this.empresaActual = {
      id: '',
      nombre_comercial: '',
      razon_social: '',
      ruc: '',
      color: '#10b9a0',
      activa: true,
      icono: 'pi pi-building',
      ruta_logo: '',
      ruta_firma: '',
      direccion: '',
      telefonos: '',
      correo: ''
    };
    this.empresaDialog = true;
  }

  editarEmpresa(empresa: IEmpresa) {
    this.esEdicion = true; // Avisamos que estamos editando
    this.empresaActual = { ...empresa };
    this.empresaDialog = true;
  }

  async guardarEmpresa() {
    // Forzamos el ID a mayúsculas y quitamos espacios
    this.empresaActual.id = String(this.empresaActual.id || '').trim().toUpperCase();

    // Validación estricta
    if (!this.empresaActual.id || !this.empresaActual.nombre_comercial) {
      this.messageService.add({ severity: 'warn', summary: 'Atención', detail: 'ID y Nombre son obligatorios' });
      return;
    }

    this.enviando = true;
    try {
      // Limpiamos el objeto para asegurar que enviamos todo correcto
      const payload = {
        id: this.empresaActual.id,
        nombre_comercial: this.empresaActual.nombre_comercial,
        razon_social: this.empresaActual.razon_social || '',
        ruc: this.empresaActual.ruc || '',
        color: this.empresaActual.color || '#10b9a0',
        activa: this.empresaActual.activa,
        icono: this.empresaActual.icono || 'pi pi-building',
        ruta_logo: this.empresaActual.ruta_logo || '',
        ruta_firma: this.empresaActual.ruta_firma || '',
        direccion: this.empresaActual.direccion || '',
        telefonos: this.empresaActual.telefonos || '',
        correo: this.empresaActual.correo || '',
        bg_class: this.empresaActual.bg_class || 'bg-gray-50',
        text_class: this.empresaActual.text_class || 'text-gray-800',
        border_hover: this.empresaActual.border_hover || 'hover:border-gray-500'
      };

      if (this.esEdicion) {
        // ACTUALIZAR SEGURA
        await this.supabaseSvc.actualizarEmpresa(this.empresaActual.id, payload);
        this.messageService.add({ severity: 'success', summary: 'Actualizado', detail: 'Datos guardados correctamente' });
      } else {
        // CREACIÓN SEGURA (Previene sobreescribir si pones un ID que ya existe)
        const idRepetido = this.empresas.find(e => e.id === payload.id);
        if (idRepetido) {
          this.messageService.add({ severity: 'error', summary: 'Error', detail: 'Ese ID de sistema ya está siendo usado.' });
          this.enviando = false;
          return;
        }
        await this.supabaseSvc.crearEmpresa(payload);
        this.messageService.add({ severity: 'success', summary: 'Creado', detail: 'Empresa nueva registrada' });
      }

      this.empresaDialog = false;
      await this.cargarEmpresas();
      
    } catch (error: any) {
      console.error("Error al guardar:", error);
      this.messageService.add({ severity: 'error', summary: 'Error DB', detail: 'No se pudo guardar la información.' });
    } finally {
      this.enviando = false;
    }
  }
}
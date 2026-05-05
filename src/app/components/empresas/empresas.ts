import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { IEmpresa, ICuentaBancaria } from '../../models/empresa.model';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ColorPickerModule } from 'primeng/colorpicker';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-empresas',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    TableModule, ButtonModule, InputTextModule,
    DialogModule, ToggleSwitchModule, ColorPickerModule,
    ToastModule, TagModule, TooltipModule, ConfirmDialogModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './empresas.html'
})
export class EmpresasComponent implements OnInit {

  empresas: IEmpresa[] = [];
  empresaDialog = false;
  esEdicion     = false;
  enviando      = false;

  empresaActual: IEmpresa = this.vacia();

  constructor(
    private supabase: SupabaseService,
    private msg: MessageService,
    private confirm: ConfirmationService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.cargarEmpresas();
  }

  // ── Carga ─────────────────────────────────────────────────────────────────

  async cargarEmpresas() {
    try {
      const raw = await this.supabase.getEmpresas();
      // Normaliza cuentas_bancarias null → [] y mostrar_cuentas null → true
      this.empresas = raw.map(e => ({
        ...e,
        cuentas_bancarias: Array.isArray(e.cuentas_bancarias) ? e.cuentas_bancarias : [],
        mostrar_cuentas:   e.mostrar_cuentas ?? true
      }));
      this.cdr.detectChanges();
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las empresas' });
    }
  }

  // ── Abrir modal ───────────────────────────────────────────────────────────

  abrirNuevo() {
    this.empresaActual = this.vacia();
    this.esEdicion     = false;
    this.empresaDialog = true;
  }

  editarEmpresa(emp: IEmpresa) {
    this.empresaActual = {
      ...emp,
      cuentas_bancarias: Array.isArray(emp.cuentas_bancarias)
        ? JSON.parse(JSON.stringify(emp.cuentas_bancarias))
        : [],
      mostrar_cuentas: emp.mostrar_cuentas ?? true
    };
    this.esEdicion     = true;
    this.empresaDialog = true;
  }

  // ── Cuentas bancarias ─────────────────────────────────────────────────────

  agregarCuenta() {
    const nueva: ICuentaBancaria = { banco: '', tipo: 'Cuenta Corriente', numero: '', cci: '' };
    this.empresaActual.cuentas_bancarias.push(nueva);
  }

  eliminarCuenta(i: number) {
    this.empresaActual.cuentas_bancarias.splice(i, 1);
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  async guardarEmpresa() {
    if (!this.empresaActual.id?.trim() || !this.empresaActual.nombre_comercial?.trim()) {
      this.msg.add({ severity: 'warn', summary: 'Atención', detail: 'ID y Nombre Comercial son obligatorios' });
      return;
    }
    this.enviando = true;
    try {
      const cuentasLimpias: ICuentaBancaria[] = this.empresaActual.cuentas_bancarias
        .filter(c => c.banco?.trim() && c.numero?.trim());

      await this.supabase.guardarEmpresa({
        ...this.empresaActual,
        id:                this.empresaActual.id.trim().toUpperCase(),
        cuentas_bancarias: cuentasLimpias
      });

      this.msg.add({ severity: 'success', summary: '¡Guardado!', detail: 'Empresa actualizada correctamente' });
      this.empresaDialog = false;
      await this.cargarEmpresas();
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error al guardar', detail: e?.message || 'Error desconocido' });
    } finally {
      this.enviando = false;
    }
  }

  // ── Eliminar empresa ──────────────────────────────────────────────────────

  confirmarEliminar(emp: IEmpresa) {
    this.confirm.confirm({
      header:  'Eliminar empresa',
      message: `¿Eliminar <strong>${emp.nombre_comercial}</strong>? Esta acción no se puede deshacer.`,
      icon:    'pi pi-exclamation-triangle',
      acceptLabel:   'Sí, eliminar',
      rejectLabel:   'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: async () => {
        try {
          await this.supabase.eliminarEmpresa(emp.id);
          this.msg.add({ severity: 'success', summary: 'Eliminada', detail: `${emp.nombre_comercial} fue eliminada` });
          await this.cargarEmpresas();
        } catch (e: any) {
          this.msg.add({ severity: 'error', summary: 'Error', detail: e?.message || 'No se pudo eliminar' });
        }
      }
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

 private vacia(): IEmpresa {
  return {
    id: '',
    nombre_comercial: '',
    razon_social: '',
    ruc: '',
    color: '01696f',
    direccion: '',
    telefonos: '',
    correo: '',
    ruta_logo: '',
    ruta_firma: '',
    activa: true,
    cuentas_bancarias: [],
    contacto_aprobacion: '',
    mostrar_cuentas: true,
    prefijo: ''
  };
}
}
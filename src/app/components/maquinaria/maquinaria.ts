import { Component, OnInit, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { IMaquinaria } from '../../models/maquinaria.model';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageService, ConfirmationService } from 'primeng/api';

@Component({
  selector: 'app-maquinaria',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, InputTextModule, InputNumberModule,
    TagModule, DialogModule, ToastModule, TooltipModule, CheckboxModule,
    ConfirmDialogModule, ProgressSpinnerModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './maquinaria.html'
})
export class MaquinariaComponent implements OnInit {
  items: IMaquinaria[] = [];
  cargando = signal(true);
  empresaActiva: any = null;

  modalVisible = false;
  esEdicion = false;
  guardando = false;

  form: IMaquinaria = this.formVacio();

  constructor(
    private supabase: SupabaseService,
    private msg: MessageService,
    private confirm: ConfirmationService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    const data = sessionStorage.getItem('empresa_activa');
    if (data) this.empresaActiva = JSON.parse(data);
    await this.cargar();
  }

  async cargar() {
    this.cargando.set(true);
    try {
      if (!this.empresaActiva?.id) { this.items = []; return; }
      const { data, error } = await this.supabase.client
        .from('maquinaria')
        .select('*')
        .eq('empresa_id', this.empresaActiva.id)
        .order('nombre');
      if (error) throw error;
      this.items = data || [];
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la maquinaria' });
    } finally {
      this.cargando.set(false);
      this.cdr.detectChanges();
    }
  }

  formVacio(): IMaquinaria {
    return { empresa_id: '', nombre: '', descripcion: '', tipo: '', marca: '', modelo: '',
      precio_hora: undefined, precio_dia: undefined, precio_mes: undefined, precio_venta: undefined, activa: true };
  }

  abrirNuevo() {
    this.esEdicion = false;
    this.form = this.formVacio();
    this.modalVisible = true;
  }

  editar(item: IMaquinaria) {
    this.esEdicion = true;
    this.form = { ...item };
    this.modalVisible = true;
  }

  resetForm() {
    this.form = this.formVacio();
  }

  async guardar() {
    if (!this.form.nombre?.trim()) {
      this.msg.add({ severity: 'warn', summary: 'Validación', detail: 'El nombre es obligatorio' });
      return;
    }
    this.guardando = true;
    try {
      const datos = {
        ...this.form,
        empresa_id: this.empresaActiva.id,
        nombre: this.form.nombre.trim()
      };

      if (this.esEdicion && datos.id) {
        const { error } = await this.supabase.client
          .from('maquinaria').update(datos).eq('id', datos.id);
        if (error) throw error;
        this.msg.add({ severity: 'success', summary: 'Actualizado', detail: 'Equipo actualizado' });
      } else {
        const { error } = await this.supabase.client
          .from('maquinaria').insert([datos]);
        if (error) throw error;
        this.msg.add({ severity: 'success', summary: 'Creado', detail: 'Equipo agregado al catálogo' });
      }
      this.modalVisible = false;
      await this.cargar();
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: e.message });
    } finally { this.guardando = false; }
  }

  confirmarEliminar(item: IMaquinaria) {
    this.confirm.confirm({
      message: `¿Eliminar "${item.nombre}" del catálogo?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.eliminar(item)
    });
  }

  async eliminar(item: IMaquinaria) {
    try {
      const { error } = await this.supabase.client
        .from('maquinaria').delete().eq('id', item.id!);
      if (error) throw error;
      this.items = this.items.filter(i => i.id !== item.id);
      this.msg.add({ severity: 'success', summary: 'Eliminado', detail: 'Equipo eliminado' });
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar' });
    }
  }
}

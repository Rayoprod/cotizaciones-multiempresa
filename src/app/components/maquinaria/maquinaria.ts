import { Component, OnInit, signal, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { IMaquinaria, LecturaHorometro } from '../../models/maquinaria.model';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TableModule } from 'primeng/table';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageService, ConfirmationService } from 'primeng/api';

@Component({
  selector: 'app-maquinaria',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, InputTextModule, InputNumberModule,
    TagModule, DialogModule, DrawerModule, ToastModule, TooltipModule,
    CheckboxModule, ConfirmDialogModule, ProgressBarModule, ProgressSpinnerModule,
    TableModule, SelectModule, DatePickerModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './maquinaria.html'
})
export class MaquinariaComponent implements OnInit {
  items: IMaquinaria[] = [];
  cargando = signal(true);
  empresaActiva: any = null;

  // ── CRUD ─────────────────────────────────────────────────────────────────
  modalVisible = false;
  esEdicion = false;
  guardando = false;

  form: IMaquinaria = this.formVacio();

  // ── KPIs ─────────────────────────────────────────────────────────────────
  totalFlota = 0;
  operativas = 0;
  proximasMantenimiento = 0;
  vencidasMantenimiento = 0;

  // ── Lecturas ─────────────────────────────────────────────────────────────
  drawerLecturasVisible = false;
  maquinaSeleccionada: IMaquinaria | null = null;
  lecturas: LecturaHorometro[] = [];
  cargandoLecturas = false;

  nuevaLectura: LecturaHorometro = {
    maquina_id: '',
    horometro: 0,
    fecha_lectura: new Date().toISOString().slice(0, 10),
    tipo_evento: 'lectura',
    operador: '',
    observaciones: ''
  };
  guardandoLectura = false;

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
      this.items = (data || []).map((m: any) => this.calcularEstadoMantenimiento(m));
      this.calcularKPIs();
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la maquinaria' });
    } finally {
      this.cargando.set(false);
      this.cdr.detectChanges();
    }
  }

  // ─── Cálculo de estado de mantenimiento ─────────────────────────────────

  private calcularEstadoMantenimiento(maquina: any): IMaquinaria {
    const horometroActual = maquina.horometro_actual || maquina.horometro_inicial || 0;
    const intervalo = maquina.intervalo_mantenimiento || 0;
    const ultimoMant = maquina.ultimo_mantenimiento ?? maquina.horometro_inicial ?? 0;

    const horasDesdeMant = horometroActual - ultimoMant;
    const horasRestantes = intervalo > 0 ? intervalo - horasDesdeMant : 0;
    const porcentajeProgreso = intervalo > 0 ? (horasDesdeMant / intervalo) * 100 : 0;

    let estadoMantenimiento: 'al_dia' | 'proximo' | 'vencido' = 'al_dia';
    if (intervalo > 0) {
      if (porcentajeProgreso > 100) estadoMantenimiento = 'vencido';
      else if (porcentajeProgreso > 85) estadoMantenimiento = 'proximo';
    }

    return {
      ...maquina,
      horas_desde_mantenimiento: horasDesdeMant,
      horas_restantes: horasRestantes,
      porcentaje_progreso: porcentajeProgreso,
      estado_mantenimiento: estadoMantenimiento
    };
  }

  private calcularKPIs() {
    this.totalFlota = this.items.length;
    this.operativas = this.items.filter(i => i.activa && i.estado === 'operativa').length;
    this.proximasMantenimiento = this.items.filter(i => i.estado_mantenimiento === 'proximo').length;
    this.vencidasMantenimiento = this.items.filter(i => i.estado_mantenimiento === 'vencido').length;
  }

  // ─── CRUD (Nuevo/Editar/Eliminar) ──────────────────────────────────────

  formVacio(): IMaquinaria {
    return {
      empresa_id: '',
      nombre: '',
      descripcion: '',
      tipo: '',
      marca: '',
      modelo: '',
      precio_hora: undefined,
      precio_dia: undefined,
      precio_mes: undefined,
      precio_venta: undefined,
      activa: true,
      horometro_inicial: 0,
      horometro_actual: 0,
      intervalo_mantenimiento: 250,
      ultimo_mantenimiento: 0
    };
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
      this.calcularKPIs();
      this.msg.add({ severity: 'success', summary: 'Eliminado', detail: 'Equipo eliminado' });
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar' });
    }
  }

  // ─── Lecturas de Horómetro ─────────────────────────────────────────────

  abrirLecturas(maquina: IMaquinaria) {
    this.maquinaSeleccionada = maquina;
    this.nuevaLectura = {
      maquina_id: maquina.id || '',
      horometro: maquina.horometro_actual || 0,
      fecha_lectura: new Date().toISOString().slice(0, 10),
      tipo_evento: 'lectura',
      operador: '',
      observaciones: ''
    };
    this.drawerLecturasVisible = true;
    this.cargarLecturas();
  }

  async cargarLecturas() {
    if (!this.maquinaSeleccionada?.id) return;
    this.cargandoLecturas = true;
    try {
      const { data, error } = await this.supabase.client
        .from('lecturas_horometro')
        .select('*')
        .eq('maquina_id', this.maquinaSeleccionada.id)
        .order('fecha_lectura', { ascending: false })
        .limit(20);
      if (error) throw error;
      this.lecturas = data || [];
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las lecturas' });
    } finally {
      this.cargandoLecturas = false;
      this.cdr.detectChanges();
    }
  }

  async guardarLectura() {
    if (!this.nuevaLectura.horometro || !this.nuevaLectura.fecha_lectura) {
      this.msg.add({ severity: 'warn', summary: 'Campos requeridos', detail: 'Ingresa el horómetro y la fecha' });
      return;
    }
    this.guardandoLectura = true;
    try {
      const { error } = await this.supabase.client
        .from('lecturas_horometro')
        .insert([this.nuevaLectura]);
      if (error) throw error;

      const nuevoHorometro = this.nuevaLectura.horometro;
      let ultimoMantenimiento = this.maquinaSeleccionada?.ultimo_mantenimiento;
      if (this.nuevaLectura.tipo_evento === 'mantenimiento') {
        ultimoMantenimiento = nuevoHorometro;
      }

      await this.supabase.client
        .from('maquinaria')
        .update({
          horometro_actual: nuevoHorometro,
          ultimo_mantenimiento: ultimoMantenimiento
        })
        .eq('id', this.maquinaSeleccionada!.id!);

      this.msg.add({ severity: 'success', summary: 'Lectura registrada', detail: 'Horómetro actualizado' });
      await this.cargar();
      await this.cargarLecturas();
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: e.message });
    } finally {
      this.guardandoLectura = false;
    }
  }

  // ─── Helpers para el template ───────────────────────────────────────────

  getColorEstadoMantenimiento(estado: string | undefined): 'success' | 'warn' | 'danger' | 'secondary' {
    switch (estado) {
      case 'al_dia': return 'success';
      case 'proximo': return 'warn';
      case 'vencido': return 'danger';
      default: return 'secondary';
    }
  }

  getEtiquetaEstadoMantenimiento(estado: string | undefined): string {
    switch (estado) {
      case 'al_dia': return 'Al día';
      case 'proximo': return 'Próximo';
      case 'vencido': return 'Vencido';
      default: return 'Sin datos';
    }
  }
}
import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { IMaquinaria, LecturaHorometro } from '../../models/maquinaria.model';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputNumberModule } from 'primeng/inputnumber';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TableModule } from 'primeng/table';
import { MessageService, ConfirmationService } from 'primeng/api';

@Component({
  selector: 'app-maquinaria',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, InputTextModule, InputNumberModule,
    TagModule, DialogModule, ToastModule, TooltipModule,
    CheckboxModule, ConfirmDialogModule, ProgressBarModule, ProgressSpinnerModule,
    SelectModule, DatePickerModule, TableModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './maquinaria.html'
})
export class MaquinariaComponent implements OnInit {
  items: IMaquinaria[] = [];
  itemsFiltrados: IMaquinaria[] = [];
  cargando = true;
  empresaActiva: any = null;

  // ── Filtros ───────────────────────────────────────────────────────────────
  filtroEstado: string | null = null;
  filtroMantenimiento: string | null = null;
  busqueda: string = '';

  readonly estadosMaquina = [
    { label: 'Todas', value: null },
    { label: 'Operativa', value: 'operativa' },
    { label: 'En mantenimiento', value: 'mantenimiento' },
    { label: 'De baja', value: 'baja' }
  ];

  readonly estadosMantenimiento = [
    { label: 'Todos', value: null },
    { label: 'Al día', value: 'al_dia' },
    { label: 'Próximo', value: 'proximo' },
    { label: 'Vencido', value: 'vencido' }
  ];

  // ── CRUD Maquinaria ─────────────────────────────────────────────────────
  modalVisible = false;
  esEdicion = false;
  guardando = false;
  form: IMaquinaria = this.formVacio();

  // ── KPIs ─────────────────────────────────────────────────────────────────
  operativas = 0;
  enMantenimiento = 0;
  proximasMantenimiento = 0;
  vencidasMantenimiento = 0;

  // ── Operaciones ──────────────────────────────────────────────────────────
  dialogoOperacionesVisible = false;
  maquinaSeleccionada: IMaquinaria | null = null;
  lecturas: LecturaHorometro[] = [];
  cargandoLecturas = false;
  guardandoLectura = false;
  editandoOperacion = false;
  operacionEditadaId: string | null = null;

  nuevaLectura: LecturaHorometro = this.lecturaVacia();
  fechaOperacion: Date = new Date();

  get ultimoHorometro(): number {
    if (this.lecturas.length > 0) {
      return Math.max(...this.lecturas.map(l => l.horometro || 0));
    }
    return this.maquinaSeleccionada?.horometro_actual || 0;
  }

  get historialLecturas(): LecturaHorometro[] {
    return this.lecturas;
  }

  get hayLecturas(): boolean {
    return this.lecturas.length > 0;
  }

  get totalLecturas(): number {
    return this.lecturas.length;
  }

  // ── Items filtrados ──────────────────────────────────────────────────────
  aplicarFiltros() {
    let result = this.items;
    if (this.filtroEstado) {
      result = result.filter(i => i.estado === this.filtroEstado);
    }
    if (this.filtroMantenimiento) {
      result = result.filter(i => i.estado_mantenimiento === this.filtroMantenimiento);
    }
    if (this.busqueda.trim()) {
      const q = this.busqueda.toLowerCase();
      result = result.filter(i =>
        i.nombre.toLowerCase().includes(q) ||
        (i.marca || '').toLowerCase().includes(q) ||
        (i.modelo || '').toLowerCase().includes(q) ||
        (i.tipo || '').toLowerCase().includes(q)
      );
    }
    this.itemsFiltrados = result;
  }

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
    this.cargando = true;
    try {
      if (!this.empresaActiva?.id) { this.items = []; this.itemsFiltrados = []; return; }
      const { data, error } = await this.supabase.client
        .from('maquinaria')
        .select('*')
        .eq('empresa_id', this.empresaActiva.id)
        .order('nombre');
      if (error) throw error;
      this.items = (data || []).map((m: any) => this.calcularEstadoMantenimiento(m));
      this.aplicarFiltros();
      this.calcularKPIs();
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar la maquinaria' });
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

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
    const all = this.items;
    this.operativas = all.filter(i => i.activa && i.estado === 'operativa').length;
    this.enMantenimiento = all.filter(i => i.estado === 'mantenimiento').length;
    this.proximasMantenimiento = all.filter(i => i.estado_mantenimiento === 'proximo').length;
    this.vencidasMantenimiento = all.filter(i => i.estado_mantenimiento === 'vencido').length;
  }

  // ─── CRUD Maquinaria ─────────────────────────────────────────────────────
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
    this.form = {
      id: item.id,
      empresa_id: item.empresa_id,
      nombre: item.nombre,
      descripcion: item.descripcion,
      tipo: item.tipo,
      marca: item.marca,
      modelo: item.modelo,
      precio_hora: item.precio_hora,
      precio_dia: item.precio_dia,
      precio_mes: item.precio_mes,
      precio_venta: item.precio_venta,
      activa: item.activa,
      horometro_inicial: item.horometro_inicial ?? 0,
      horometro_actual: item.horometro_actual ?? 0,
      intervalo_mantenimiento: item.intervalo_mantenimiento ?? 250,
      ultimo_mantenimiento: item.ultimo_mantenimiento ?? 0
    };
    this.modalVisible = true;
  }

  resetForm() {
    this.form = this.formVacio();
  }

  async guardar() {
    if (!this.form.nombre?.trim()) {
      this.msg.add({ severity: 'warn', summary: 'Validacion', detail: 'El nombre es obligatorio' });
      return;
    }
    if ((this.form.horometro_actual ?? 0) < (this.form.horometro_inicial ?? 0)) {
      this.msg.add({ severity: 'warn', summary: 'Validacion', detail: 'El horometro actual no puede ser menor que el inicial' });
      return;
    }
    if ((this.form.intervalo_mantenimiento ?? 0) < 0) {
      this.msg.add({ severity: 'warn', summary: 'Validacion', detail: 'El intervalo de mantenimiento no puede ser negativo' });
      return;
    }
    if ((this.form.precio_hora ?? 0) < 0 || (this.form.precio_dia ?? 0) < 0 || (this.form.precio_mes ?? 0) < 0 || (this.form.precio_venta ?? 0) < 0) {
      this.msg.add({ severity: 'warn', summary: 'Validacion', detail: 'Los precios no pueden ser negativos' });
      return;
    }
    this.guardando = true;
    try {
      const datos: any = {
        empresa_id: this.empresaActiva.id,
        nombre: this.form.nombre.trim(),
        descripcion: this.form.descripcion || '',
        tipo: this.form.tipo || '',
        marca: this.form.marca || '',
        modelo: this.form.modelo || '',
        precio_hora: this.form.precio_hora ?? null,
        precio_dia: this.form.precio_dia ?? null,
        precio_mes: this.form.precio_mes ?? null,
        precio_venta: this.form.precio_venta ?? null,
        activa: this.form.activa ?? true,
        horometro_inicial: this.form.horometro_inicial ?? 0,
        horometro_actual: this.form.horometro_actual ?? 0,
        intervalo_mantenimiento: this.form.intervalo_mantenimiento ?? 250,
        ultimo_mantenimiento: this.form.ultimo_mantenimiento ?? 0
      };

      if (this.esEdicion && this.form.id) {
        const { error } = await this.supabase.client
          .from('maquinaria').update(datos).eq('id', this.form.id);
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
      const { error } = await this.supabase.client.from('maquinaria').delete().eq('id', item.id!);
      if (error) throw error;
      this.items = this.items.filter(i => i.id !== item.id);
      this.aplicarFiltros();
      this.calcularKPIs();
      this.msg.add({ severity: 'success', summary: 'Eliminado', detail: 'Equipo eliminado' });
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar' });
    }
  }

  // ─── Operaciones ─────────────────────────────────────────────────────────
  get hoy(): Date {
    return new Date();
  }

  private lecturaVacia(): LecturaHorometro {
    return {
      maquina_id: '',
      horometro: 0,
      fecha_lectura: '',
      tipo_evento: 'lectura',
      operador: '',
      observaciones: ''
    };
  }

  async abrirDialogoOperaciones(maquina: IMaquinaria) {
    this.maquinaSeleccionada = maquina;
    this.resetFormularioOperacion();
    this.dialogoOperacionesVisible = true;
    await this.cargarHistorialOperaciones();
    if (this.lecturas.length > 0) {
      const maxHorometro = Math.max(...this.lecturas.map(l => l.horometro || 0));
      this.nuevaLectura.horometro = maxHorometro;
    }
  }

  resetFormularioOperacion() {
    this.editandoOperacion = false;
    this.operacionEditadaId = null;
    this.nuevaLectura = this.lecturaVacia();
    this.nuevaLectura.maquina_id = this.maquinaSeleccionada?.id || '';
    this.nuevaLectura.horometro = this.maquinaSeleccionada?.horometro_actual || 0;
    this.fechaOperacion = new Date();
  }

  async cargarHistorialOperaciones() {
    if (!this.maquinaSeleccionada?.id) return;
    this.cargandoLecturas = true;
    try {
      const { data, error } = await this.supabase.client
        .from('lecturas_horometro')
        .select('*')
        .eq('maquina_id', this.maquinaSeleccionada.id)
        .order('fecha_lectura', { ascending: false })
        .order('horometro', { ascending: false })
        .limit(20);
      if (error) throw error;
      this.lecturas = data || [];
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las operaciones' });
    } finally {
      this.cargandoLecturas = false;
      this.cdr.markForCheck();
    }
  }

  editarOperacion(lectura: LecturaHorometro) {
    this.editandoOperacion = true;
    this.operacionEditadaId = lectura.id!;
    this.nuevaLectura = { ...lectura };
    this.fechaOperacion = lectura.fecha_lectura ? new Date(lectura.fecha_lectura + 'T12:00:00') : new Date();
  }

  confirmarEliminarOperacion(lectura: LecturaHorometro) {
    this.confirm.confirm({
      message: `¿Eliminar esta operación del historial?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.eliminarOperacion(lectura.id!)
    });
  }

  async eliminarOperacion(id: string) {
    try {
      const { error } = await this.supabase.client
        .from('lecturas_horometro')
        .delete()
        .eq('id', id);
      if (error) throw error;
      this.msg.add({ severity: 'success', summary: 'Eliminado', detail: 'Registro eliminado del historial' });
      await this.cargarHistorialOperaciones();
      await this.recalcularHorometroMaquina();
      await this.cargar();
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar el registro' });
    }
  }

  private async recalcularHorometroMaquina() {
    if (!this.maquinaSeleccionada?.id) return;
    const { data } = await this.supabase.client
      .from('lecturas_horometro')
      .select('horometro, tipo_evento')
      .eq('maquina_id', this.maquinaSeleccionada.id)
      .order('horometro', { ascending: false })
      .limit(1);

    const maxLectura = data && data.length > 0 ? data[0].horometro : (this.maquinaSeleccionada.horometro_inicial || 0);

    const updateData: any = { horometro_actual: maxLectura };

    const { data: ultimoMant } = await this.supabase.client
      .from('lecturas_horometro')
      .select('horometro')
      .eq('maquina_id', this.maquinaSeleccionada.id)
      .eq('tipo_evento', 'mantenimiento')
      .order('horometro', { ascending: false })
      .limit(1);

    if (ultimoMant && ultimoMant.length > 0) {
      updateData.ultimo_mantenimiento = ultimoMant[0].horometro;
    }

    await this.supabase.client
      .from('maquinaria')
      .update(updateData)
      .eq('id', this.maquinaSeleccionada.id);
  }

  async guardarOperacion() {
    if (!this.nuevaLectura.horometro || this.nuevaLectura.horometro <= 0) {
      this.msg.add({ severity: 'warn', summary: 'Validacion', detail: 'Ingresa un valor de horometro valido' });
      return;
    }
    if (!this.fechaOperacion) {
      this.msg.add({ severity: 'warn', summary: 'Validacion', detail: 'Selecciona una fecha' });
      return;
    }

    const hoy = new Date();
    hoy.setHours(23, 59, 59, 999);
    if (this.fechaOperacion > hoy) {
      this.msg.add({ severity: 'warn', summary: 'Fecha invalida', detail: 'No se puede registrar una operacion con fecha futura' });
      return;
    }

    if (!this.editandoOperacion && this.lecturas.length > 0) {
      const maxActual = Math.max(...this.lecturas.map(l => l.horometro || 0));
      if (this.nuevaLectura.horometro < maxActual) {
        this.msg.add({ severity: 'warn', summary: 'Validacion', detail: `El horometro no puede bajar. Ultimo registrado: ${maxActual} h` });
        return;
      }
    }

    const fechaStr = this.fechaOperacion.toISOString().slice(0, 10);

    this.guardandoLectura = true;
    try {
      const payload = {
        maquina_id: this.maquinaSeleccionada!.id!,
        horometro: this.nuevaLectura.horometro,
        fecha_lectura: fechaStr,
        tipo_evento: this.nuevaLectura.tipo_evento,
        operador: this.nuevaLectura.operador || null,
        observaciones: this.nuevaLectura.observaciones || null
      };

      if (this.editandoOperacion && this.operacionEditadaId) {
        const { error } = await this.supabase.client
          .from('lecturas_horometro')
          .update(payload)
          .eq('id', this.operacionEditadaId);
        if (error) throw error;
        this.msg.add({ severity: 'success', summary: 'Actualizado', detail: 'Operación actualizada correctamente' });
      } else {
        const { error } = await this.supabase.client
          .from('lecturas_horometro')
          .insert([payload]);
        if (error) throw error;
        this.msg.add({ severity: 'success', summary: 'Registrado', detail: 'Operación guardada correctamente' });
      }

      if (this.nuevaLectura.horometro > (this.maquinaSeleccionada?.horometro_actual || 0)) {
        const updateData: any = { horometro_actual: this.nuevaLectura.horometro };
        if (this.nuevaLectura.tipo_evento === 'mantenimiento') {
          updateData.ultimo_mantenimiento = this.nuevaLectura.horometro;
        }
        await this.supabase.client
          .from('maquinaria')
          .update(updateData)
          .eq('id', this.maquinaSeleccionada!.id!);
      }

      await this.cargar();
      const fresca = this.items.find(i => i.id === this.maquinaSeleccionada?.id);
      if (fresca) this.maquinaSeleccionada = fresca;
      await this.cargarHistorialOperaciones();
      this.resetFormularioOperacion();
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: e.message });
    } finally {
      this.guardandoLectura = false;
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────
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

  getColorEstadoMaquina(estado: string | undefined): 'success' | 'warn' | 'danger' | 'info' {
    switch (estado) {
      case 'operativa': return 'success';
      case 'mantenimiento': return 'warn';
      case 'baja': return 'danger';
      default: return 'info';
    }
  }

  getEtiquetaEstadoMaquina(estado: string | undefined): string {
    switch (estado) {
      case 'operativa': return 'Operativa';
      case 'mantenimiento': return 'En mantenimiento';
      case 'baja': return 'De baja';
      default: return 'Desconocido';
    }
  }
}
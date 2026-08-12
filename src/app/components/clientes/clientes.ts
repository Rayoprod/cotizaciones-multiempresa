import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToolbarModule } from 'primeng/toolbar';

import { SupabaseService } from '../../services/supabase.service';
import { ApiPeruService } from '../../services/api-peru.service';
import { SessionContextService } from '../../services/session-context.service';
import { ICliente} from '../../models';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';
import { ConfirmDialogModule } from 'primeng/confirmdialog';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TableModule, ButtonModule,
    InputTextModule, DialogModule, ToolbarModule, ProgressSpinnerModule,
    TagModule, TooltipModule, ToastModule, ConfirmDialogModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './clientes.html'
})
export class ClientesComponent implements OnInit {

  clientes: ICliente[] = [];
  cargando = true;
  clienteDialog = false;
  clienteActual: ICliente = this.clienteVacio();
  clienteOriginal: string = '';
  enviando: boolean = false;
  buscandoApi: boolean = false;
  empresaActiva: any;

  constructor(
    private supabaseSvc: SupabaseService,
    private apiPeru: ApiPeruService,
    private session: SessionContextService,
    private cdr: ChangeDetectorRef,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  async ngOnInit() {
    this.empresaActiva = this.session.empresaActiva();
    await this.cargarClientes();
  }

  async cargarClientes() {
    const empresa = this.empresaActiva || this.session.empresaActiva();
    if (!empresa?.id) return;
    this.empresaActiva = empresa;
    this.cargando = true;
    try {
      this.clientes = await this.supabaseSvc.getClientes(empresa.id) as ICliente[];
    } catch (error) {
      console.error('Error al cargar clientes:', error);
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  get clientesConCorreo(): number {
    return this.clientes.filter(c => c.correo).length;
  }

  get clientesConTelefono(): number {
    return this.clientes.filter(c => c.telefono).length;
  }

  abrirNuevo() {
    const empresa = this.empresaActiva || this.session.empresaActiva();
    if (!empresa?.id) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Empresa no seleccionada',
        detail: 'Por favor selecciona una empresa activa.'
      });
      return;
    }
    this.empresaActiva = empresa;
    this.clienteActual = {
      ...this.clienteVacio(),
      empresa_id: empresa.id
    };
    delete (this.clienteActual as any).id;
    this.clienteOriginal = JSON.stringify(this.clienteActual);
    this.enviando = false;
    this.clienteDialog = true;
  }

  editarCliente(cliente: ICliente) {
    this.clienteActual = { ...cliente };
    this.clienteOriginal = JSON.stringify(this.clienteActual);
    this.clienteDialog = true;
  }

  async buscarDocumento() {
    if (this.buscandoApi) return;

    const doc = String(this.clienteActual.documento_identidad || '').trim();

    if (!doc) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Campo vacío',
        detail: 'Escribe un DNI o RUC'
      });
      return;
    }

    const clienteExistente = this.clientes.find(
      c => String(c.documento_identidad || '').trim() === doc
    );

    if (clienteExistente) {
      this.clienteActual.nombre_razon_social = clienteExistente.nombre_razon_social || '';
      this.clienteActual.direccion = clienteExistente.direccion || '';
      this.clienteActual.telefono = clienteExistente.telefono || '';
      this.clienteActual.correo = clienteExistente.correo || '';
      this.cdr.markForCheck();
      return;
    }

    if (doc.length !== 8 && doc.length !== 11) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Formato inválido',
        detail: 'El DNI debe tener 8 dígitos y el RUC 11.'
      });
      return;
    }

    this.buscandoApi = true;
    this.cdr.markForCheck();

    try {
      const datosCrudos = await this.apiPeru.buscarDocumento(doc);
      if (!datosCrudos) throw new Error('No encontrado');

      const datos = datosCrudos.data || datosCrudos.result || datosCrudos;
      let nombreFinal = '';

      if (doc.length === 8) {
        nombreFinal = datos.full_name || datos.nombre_completo || '';
        if (!nombreFinal) {
          const nom = datos.first_name || datos.nombres || datos.nombre || '';
          const pat = datos.first_last_name || datos.apellidoPaterno || datos.apellido_paterno || '';
          const mat = datos.second_last_name || datos.apellidoMaterno || datos.apellido_materno || '';
          nombreFinal = `${nom} ${pat} ${mat}`.trim();
        }
      } else {
        nombreFinal =
          datos.nombre_o_razon_social ||
          datos.razon_social ||
          datos.razonSocial ||
          datos.nombre_comercial ||
          datos.name || '';
      }

      this.clienteActual.nombre_razon_social = nombreFinal;
      this.clienteActual.direccion = datos.direccion_completa || datos.direccion || datos.address || '';
      if (!this.clienteActual.telefono) this.clienteActual.telefono = '';
      if (!this.clienteActual.correo) this.clienteActual.correo = '';

      this.messageService.add({ severity: 'success', summary: 'API', detail: 'Datos obtenidos de SUNAT/RENIEC.' });
      this.cdr.markForCheck();

    } catch (e) {
      console.error('Error de red:', e);
      this.messageService.add({
        severity: 'error',
        summary: 'Error de conexión',
        detail: 'No se pudo obtener datos de SUNAT/RENIEC.'
      });
    } finally {
      this.buscandoApi = false;
      this.cdr.markForCheck();
    }
  }

  async guardarCliente() {
    const empresa = this.empresaActiva || this.session.empresaActiva();
    if (!empresa?.id) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Empresa no seleccionada',
        detail: 'Por favor selecciona una empresa activa.'
      });
      return;
    }
    this.empresaActiva = empresa;

    const docTrim = String(this.clienteActual.documento_identidad || '').trim();
    const nombreTrim = String(this.clienteActual.nombre_razon_social || '').trim();

    if (!docTrim || !nombreTrim) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Campos obligatorios',
        detail: 'El DNI/RUC y el Nombre/Razón Social son obligatorios.'
      });
      return;
    }

    const docDuplicado = this.clientes.some(
      c => String(c.documento_identidad || '').trim() === docTrim && c.id !== this.clienteActual.id
    );

    if (docDuplicado) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Documento duplicado',
        detail: `El cliente con documento "${docTrim}" ya está registrado.`
      });
      return;
    }

    this.enviando = true;
    try {
      const payload: ICliente = {
        ...this.clienteActual,
        documento_identidad: docTrim,
        nombre_razon_social: nombreTrim,
        direccion: (this.clienteActual.direccion || '').trim(),
        telefono: (this.clienteActual.telefono || '').trim(),
        correo: (this.clienteActual.correo || '').trim(),
        empresa_id: empresa.id
      };

      await this.supabaseSvc.guardarCliente(payload);
      this.messageService.add({
        severity: 'success',
        summary: 'Éxito',
        detail: 'Cliente guardado correctamente.'
      });
      this.clienteDialog = false;
      await this.cargarClientes();
    } catch (error: any) {
      console.error('Error al guardar cliente:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error al guardar',
        detail: error?.message || 'Hubo un error al guardar el cliente.'
      });
    } finally {
      this.enviando = false;
      this.cdr.markForCheck();
    }
  }

  confirmarBorrarCliente(cliente: ICliente) {
    this.confirmationService.confirm({
      message: `¿Estás seguro de eliminar a "${cliente.nombre_razon_social}"?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger border-round-xl',
      rejectButtonStyleClass: 'p-button-outlined border-round-xl',
      accept: () => this.borrarCliente(cliente)
    });
  }

  async borrarCliente(cliente: ICliente) {
    try {
      if (cliente.id) {
        await this.supabaseSvc.eliminarCliente(cliente.id);
        this.messageService.add({
          severity: 'success',
          summary: 'Eliminado',
          detail: 'Cliente eliminado correctamente.'
        });
        await this.cargarClientes();
      }
    } catch (error) {
      console.error('Error al eliminar:', error);
      this.messageService.add({
        severity: 'error',
        summary: 'Error al eliminar',
        detail: 'Hubo un error al eliminar. Revisa que el cliente no tenga cotizaciones vinculadas.'
      });
    }
  }

  ocultarDialog() {
    this.clienteDialog = false;
    this.enviando = false;
    this.buscandoApi = false;
    this.clienteActual = this.clienteVacio();
    this.clienteOriginal = JSON.stringify(this.clienteActual);
  }

  private clienteVacio(): ICliente {
    return { documento_identidad: '', nombre_razon_social: '', direccion: '', telefono: '', correo: '', empresa_id: '' };
  }
}
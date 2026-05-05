import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToolbarModule } from 'primeng/toolbar';

import { SupabaseService } from '../../services/supabase.service';
import { ICliente } from '../../models/cliente.model';

@Component({
  selector: 'app-clientes',
  standalone: true,
  imports: [
    CommonModule, FormsModule, TableModule, ButtonModule,
    InputTextModule, DialogModule, ToolbarModule
  ],
  templateUrl: './clientes.html'
})
export class ClientesComponent implements OnInit {

  clientes: ICliente[] = [];
  clienteDialog: boolean = false;
  clienteActual: ICliente = this.clienteVacio();
  clienteOriginal: string = '';
  enviando: boolean = false;
  buscandoApi: boolean = false;
  empresaActiva: any;

  constructor(
    private supabaseSvc: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    const datos = sessionStorage.getItem('empresa_activa');
    this.empresaActiva = datos ? JSON.parse(datos) : null;
    await this.cargarClientes();
  }

  async cargarClientes() {
    if (!this.empresaActiva?.id) return;
    try {
      this.clientes = await this.supabaseSvc.getClientes(this.empresaActiva.id) as ICliente[];
      this.cdr.detectChanges();
    } catch (error) {
      console.error('Error al cargar clientes:', error);
    }
  }

  abrirNuevo() {
    this.clienteActual = this.clienteVacio();
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
    const doc = String(this.clienteActual.documento_identidad || '').trim();

    if (!doc) {
      alert('Escribe un DNI o RUC');
      return;
    }

    const clienteExistente = this.clientes.find(
      c => String(c.documento_identidad) === doc
    );

    if (clienteExistente) {
      this.clienteActual.nombre_razon_social = clienteExistente.nombre_razon_social || '';
      this.clienteActual.direccion = clienteExistente.direccion || '';
      this.clienteActual.telefono = clienteExistente.telefono || '';
      this.clienteActual.correo = clienteExistente.correo || '';
      this.cdr.detectChanges();
      return;
    }

    if (doc.length !== 8 && doc.length !== 11) {
      alert('El DNI debe tener 8 dígitos y el RUC 11.');
      return;
    }

    this.buscandoApi = true;

    const token = 'sk_14670.Rl3QC2eRGOShBSsUP3HL63QbRl8PmOYd';
    const tipo = doc.length === 8 ? 'reniec/dni' : 'sunat/ruc';
    const url = `/api-peru/v1/${tipo}?numero=${doc}`;

    try {
      const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const datosCrudos = await respuesta.json();

      if (!respuesta.ok || !datosCrudos) {
        alert('El documento no existe en SUNAT/RENIEC.');
        return;
      }

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

      this.cdr.detectChanges();

    } catch (e) {
      console.error('Error de red:', e);
      alert('Fallo al conectar con la API.');
    } finally {
      this.buscandoApi = false;
    }
  }

  async guardarCliente() {
    if (!this.clienteActual.documento_identidad || !this.clienteActual.nombre_razon_social) {
      alert('El DNI/RUC y el Nombre/Razón Social son obligatorios.');
      return;
    }

    const docDuplicado = this.clientes.some(
      c => c.documento_identidad === this.clienteActual.documento_identidad && c.id !== this.clienteActual.id
    );

    if (docDuplicado) {
      alert(`El cliente con documento ${this.clienteActual.documento_identidad} ya está registrado.`);
      return;
    }

    if (this.clienteOriginal === JSON.stringify(this.clienteActual)) {
      this.clienteDialog = false;
      return;
    }

    this.enviando = true;
    try {
      const payload = { ...this.clienteActual, empresa_id: this.empresaActiva.id };
      await this.supabaseSvc.guardarCliente(payload);
      this.clienteDialog = false;
      await this.cargarClientes();
    } catch (error) {
      console.error('Error al guardar:', error);
      alert('Hubo un error al guardar el cliente.');
    } finally {
      this.enviando = false;
    }
  }

  async borrarCliente(cliente: ICliente) {
    if (confirm(`¿Estás seguro de eliminar a "${cliente.nombre_razon_social}"?`)) {
      try {
        if (cliente.id) {
          await this.supabaseSvc.eliminarCliente(cliente.id);
          await this.cargarClientes();
        }
      } catch (error) {
        console.error('Error al eliminar:', error);
        alert('Hubo un error al eliminar. Revisa que el cliente no tenga cotizaciones vinculadas.');
      }
    }
  }

  ocultarDialog() {
    this.clienteDialog = false;
  }

  private clienteVacio(): ICliente {
    return { documento_identidad: '', nombre_razon_social: '', direccion: '', telefono: '', correo: '' };
  }
}
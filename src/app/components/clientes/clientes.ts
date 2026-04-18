import { Component, OnInit, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToolbarModule } from 'primeng/toolbar';

import { SupabaseService } from '../../services/supabase.service';
import { ICliente } from '../../models/cliente.model'; // <-- Molde estricto

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
  
  clienteActual: ICliente = { documento_identidad: '', nombre_razon_social: '', direccion: '', telefono: '', correo: '' };
  clienteOriginal: string = ''; 
  enviando: boolean = false;
  buscandoApi: boolean = false; // Para el botón de carga de SUNAT/RENIEC

  constructor(
    private supabaseSvc: SupabaseService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.cargarClientes();
  }

  async cargarClientes() {
    try {
      this.clientes = await this.supabaseSvc.getClientes() as ICliente[];
      this.cdr.detectChanges();
    } catch (error) {
      console.error("Error al cargar clientes:", error);
    }
  }

  abrirNuevo() {
    this.clienteActual = { documento_identidad: '', nombre_razon_social: '', direccion: '', telefono: '', correo: '' };
    this.clienteOriginal = JSON.stringify(this.clienteActual);
    this.enviando = false;
    this.clienteDialog = true;
  }

  editarCliente(cliente: ICliente) {
    this.clienteActual = { ...cliente }; 
    this.clienteOriginal = JSON.stringify(this.clienteActual);
    this.clienteDialog = true;
  }

  // 🔥 Tu función mágica de búsqueda, adaptada para el Modal
  async buscarDocumento() {
    const doc = this.clienteActual.documento_identidad ? this.clienteActual.documento_identidad.trim() : '';

    if (doc.length !== 8 && doc.length !== 11) {
      alert(`⚠️ El DNI debe tener 8 dígitos y el RUC 11.`);
      return;
    }

    this.buscandoApi = true;
    const token = 'sk_14670.Rl3QC2eRGOShBSsUP3HL63QbRl8PmOYd'; // Tu token actual
    const tipo = doc.length === 8 ? 'reniec/dni' : 'sunat/ruc';
    const url = `/api-peru/v1/${tipo}?numero=${doc}`;

    try {
      const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!respuesta.ok) {
        alert(`⚠️ No se encontraron datos para el documento ${doc}.`);
        this.buscandoApi = false;
        return;
      }
      
      const datos = await respuesta.json();
      let nombreExtraido = '';
      
      if (doc.length === 8) {
        const nom = datos.nombres || datos.nombre || datos.first_name || '';
        const pat = datos.apellidoPaterno || datos.apellido_paterno || datos.first_last_name || '';
        const mat = datos.apellidoMaterno || datos.apellido_materno || datos.second_last_name || '';
        nombreExtraido = `${nom} ${pat} ${mat}`.trim();
        if (!nombreExtraido && datos.nombre_completo) nombreExtraido = datos.nombre_completo;
      } else {
        nombreExtraido = datos.razon_social || datos.razonSocial || datos.nombre || datos.nombre_comercial || '';
      }

      this.clienteActual.nombre_razon_social = nombreExtraido; 
      this.clienteActual.direccion = datos.direccion || '';
      this.cdr.detectChanges();

    } catch (error) {
      console.error('ERROR DE RED', error);
      alert('Fallo al conectar con la API.');
    } finally {
      this.buscandoApi = false;
    }
  }

  async guardarCliente() {
    if (!this.clienteActual.documento_identidad || !this.clienteActual.nombre_razon_social) {
      alert("El DNI/RUC y el Nombre/Razón Social son obligatorios.");
      return;
    }

    // Verificar duplicado por documento
    const docDuplicado = this.clientes.some(c => 
      c.documento_identidad === this.clienteActual.documento_identidad && c.id !== this.clienteActual.id
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
      await this.supabaseSvc.guardarCliente(this.clienteActual);
      this.clienteDialog = false;
      await this.cargarClientes(); 
    } catch (error) {
      console.error("Error al guardar:", error);
      alert("Hubo un error al guardar el cliente.");
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
        console.error("Error al eliminar", error);
        alert("Hubo un error al eliminar. Revisa que el cliente no tenga cotizaciones vinculadas.");
      }
    }
  }

  ocultarDialog() {
    this.clienteDialog = false;
  }
}
import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';

interface Usuario {
  id: string;
  email?: string;
  rol: 'admin' | 'vendedor';
  activo: boolean;
}

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonModule, InputTextModule, PasswordModule,
    TagModule, DialogModule, SelectModule,
    ToastModule, ConfirmDialogModule, TooltipModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss'
})
export class UsuariosComponent implements OnInit {

  usuarios: Usuario[] = [];
  cargando = signal(true);

  modalVisible  = false;
  nuevoEmail    = '';
  nuevoPassword = '';
  nuevoRol      = 'vendedor';
  guardando     = false;
  errorModal    = '';

  rolesOpciones = [
    { label: 'Vendedor', value: 'vendedor' },
    { label: 'Admin',    value: 'admin'    }
  ];

  constructor(
    private supabase: SupabaseService,
    private msg: MessageService,
    private confirm: ConfirmationService
  ) {}

  async ngOnInit() {
    await this.cargarUsuarios();
  }

  async cargarUsuarios() {
    this.cargando.set(true);
    try {
      this.usuarios = await this.supabase.getUsuarios();
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar los usuarios' });
    } finally {
      this.cargando.set(false);
    }
  }

  abrirModal() {
    this.nuevoEmail    = '';
    this.nuevoPassword = '';
    this.nuevoRol      = 'vendedor';
    this.errorModal    = '';
    this.modalVisible  = true;
  }

  async crearUsuario() {
    if (!this.nuevoEmail || !this.nuevoPassword) {
      this.errorModal = 'Email y contraseña son obligatorios.';
      return;
    }
    if (this.nuevoPassword.length < 6) {
      this.errorModal = 'La contraseña debe tener al menos 6 caracteres.';
      return;
    }
    this.guardando  = true;
    this.errorModal = '';
    try {
      await this.supabase.crearUsuario(this.nuevoEmail, this.nuevoPassword);
      this.msg.add({ severity: 'success', summary: '¡Listo!', detail: `Usuario ${this.nuevoEmail} creado` });
      this.modalVisible = false;
      await this.cargarUsuarios();
    } catch (err: any) {
      this.errorModal = err?.message || 'Error al crear el usuario.';
    } finally {
      this.guardando = false;
    }
  }

  async cambiarRol(usuario: Usuario, nuevoRol: string) {
    try {
      await this.supabase.actualizarRolUsuario(usuario.id, nuevoRol);
      usuario.rol = nuevoRol as 'admin' | 'vendedor';
      this.msg.add({ severity: 'success', summary: 'Rol actualizado', detail: nuevoRol });
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cambiar el rol' });
    }
  }

  async toggleActivo(usuario: Usuario) {
    const nuevoEstado = !usuario.activo;
    try {
      await this.supabase.toggleActivoUsuario(usuario.id, nuevoEstado);
      usuario.activo = nuevoEstado;
      this.msg.add({
        severity: nuevoEstado ? 'success' : 'warn',
        summary: nuevoEstado ? 'Activado' : 'Desactivado',
        detail: usuario.email || usuario.id
      });
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cambiar el estado' });
    }
  }

  confirmarEliminar(usuario: Usuario) {
    this.confirm.confirm({
      message: '¿Eliminar permanentemente este usuario? Esta acción no se puede deshacer.',
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí, eliminar',
      rejectLabel: 'Cancelar',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => this.eliminar(usuario)
    });
  }

  async eliminar(usuario: Usuario) {
    try {
      await this.supabase.eliminarUsuario(usuario.id);
      this.usuarios = this.usuarios.filter(u => u.id !== usuario.id);
      this.msg.add({ severity: 'success', summary: 'Eliminado', detail: 'Usuario eliminado correctamente' });
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar el usuario' });
    }
  }
}
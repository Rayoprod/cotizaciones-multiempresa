import { Component, OnInit, signal, ChangeDetectorRef } from '@angular/core';import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { DrawerModule } from 'primeng/drawer';
import { SelectModule } from 'primeng/select';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { CheckboxModule } from 'primeng/checkbox';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
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
    TableModule, ButtonModule, InputTextModule, PasswordModule,
    TagModule, DialogModule, DrawerModule, SelectModule,
    ToastModule, ConfirmDialogModule, TooltipModule, CheckboxModule,
    ProgressSpinnerModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss'
})
export class UsuariosComponent implements OnInit {

  usuarios: Usuario[] = [];
  cargando = signal(true);

  // Modal nuevo usuario
  modalVisible  = false;
  nuevoEmail    = '';
  nuevoPassword = '';
  nuevoRol      = 'vendedor';
  guardando     = false;
  errorModal    = '';

  // Drawer empresas
  drawerVisible       = false;
  usuarioSeleccionado: Usuario | null = null;
  todasLasEmpresas:   any[] = [];
  empresasAsignadas:  string[] = [];   // IDs seleccionados
  guardandoEmpresas   = false;

  rolesOpciones = [
    { label: 'Vendedor', value: 'vendedor' },
    { label: 'Admin',    value: 'admin'    }
  ];

  get usuariosActivos(): number {
    return this.usuarios.filter(u => u.activo).length;
  }

  get usuariosAdmin(): number {
    return this.usuarios.filter(u => u.rol === 'admin').length;
  }

  get usuariosVendedor(): number {
    return this.usuarios.filter(u => u.rol === 'vendedor').length;
  }

  constructor(
  private supabase: SupabaseService,
  private msg: MessageService,
  private confirm: ConfirmationService,
  private cdr: ChangeDetectorRef   // ← agregar esto
) {}

  async ngOnInit() {
    await this.cargarUsuarios();
    // Precargamos empresas para el drawer
    this.todasLasEmpresas = await this.supabase.getEmpresas();
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

  // ── NUEVO USUARIO ────────────────────────────────
  abrirModal() {
    this.nuevoEmail    = '';
    this.nuevoPassword = '';
    this.nuevoRol      = 'vendedor';
    this.errorModal    = '';
    this.modalVisible  = true;
  }

  async crearUsuario() {
    if (!this.nuevoEmail || !this.nuevoPassword) {
      this.errorModal = 'Email y contraseña son obligatorios.'; return;
    }
    if (this.nuevoPassword.length < 6) {
      this.errorModal = 'La contraseña debe tener al menos 6 caracteres.'; return;
    }
    this.guardando = true; this.errorModal = '';
    try {
      // Crear usuario en Supabase Auth
      const { data, error } = await this.supabase.crearUsuario(this.nuevoEmail, this.nuevoPassword);
      
      if (error) {
        throw new Error(error.message);
      }
      
      // Crear perfil en la tabla profiles
      await this.supabase.client.from('profiles').insert({
        id: data.user?.id,
        email: this.nuevoEmail,
        rol: this.nuevoRol,
        activo: true
      });
      
      this.msg.add({ severity: 'success', summary: '¡Listo!', detail: `Usuario ${this.nuevoEmail} creado` });
      this.modalVisible = false;
      await this.cargarUsuarios();
    } catch (err: any) {
      console.error('Error creando usuario:', err);
      this.errorModal = err?.message || 'Error al crear el usuario.';
    } finally { this.guardando = false; }
  }

  // ── ROL / ACTIVO ─────────────────────────────────
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
    const nuevo = !usuario.activo;
    try {
      await this.supabase.toggleActivoUsuario(usuario.id, nuevo);
      usuario.activo = nuevo;
      this.msg.add({ severity: nuevo ? 'success' : 'warn',
        summary: nuevo ? 'Activado' : 'Desactivado', detail: usuario.email || usuario.id });
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cambiar el estado' });
    }
  }

  // ── ELIMINAR ─────────────────────────────────────
  confirmarEliminar(usuario: Usuario) {
    this.confirm.confirm({
      message: '¿Eliminar permanentemente este usuario?',
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
      this.msg.add({ severity: 'success', summary: 'Eliminado', detail: 'Usuario eliminado' });
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo eliminar' });
    }
  }

  // ── DRAWER EMPRESAS ───────────────────────────────
  async abrirEmpresas(usuario: Usuario) {
    // Los administradores no necesitan asignación de empresas
    if (usuario.rol === 'admin') {
      this.msg.add({ 
        severity: 'info', 
        summary: 'Acceso completo', 
        detail: 'Los administradores tienen acceso a todas las empresas automáticamente' 
      });
      return;
    }
    
    this.usuarioSeleccionado = usuario;
    this.empresasAsignadas   = [];        // limpiar antes
    this.drawerVisible       = true;      // abrir drawer primero
    this.cdr.detectChanges();             // forzar render del drawer

    try {
      this.empresasAsignadas = await this.supabase.getEmpresasDeUsuario(usuario.id);
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las empresas' });
    }

    this.cdr.detectChanges();             // forzar render con los datos cargados
  }

  toggleEmpresa(empresaId: string) {
    const idx = this.empresasAsignadas.indexOf(empresaId);
    if (idx >= 0) {
      this.empresasAsignadas.splice(idx, 1);
    } else {
      this.empresasAsignadas.push(empresaId);
    }
  }

  estaAsignada(empresaId: string): boolean {
    return this.empresasAsignadas.includes(empresaId);
  }

  async guardarEmpresas() {
    if (!this.usuarioSeleccionado) return;
    this.guardandoEmpresas = true;
    try {
      await this.supabase.guardarEmpresasDeUsuario(
        this.usuarioSeleccionado.id,
        this.empresasAsignadas
      );
      this.msg.add({ severity: 'success', summary: '¡Guardado!',
        detail: `Empresas actualizadas para ${this.usuarioSeleccionado.email}` });
      this.drawerVisible = false;
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar' });
    } finally { this.guardandoEmpresas = false; }
  }
}
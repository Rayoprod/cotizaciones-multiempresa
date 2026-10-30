import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { SidebarModule } from 'primeng/sidebar';
import { DropdownModule } from 'primeng/dropdown';
import { ToastModule } from 'primeng/toast';
import { MessageService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';
import { TooltipModule } from 'primeng/tooltip';
import { CheckboxModule } from 'primeng/checkbox';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { RolEmpresa, RolGlobal } from '../../models';

interface Usuario {
  id: string;
  email?: string;
  rol: RolGlobal;
  activo: boolean;
}

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    TableModule, ButtonModule, InputTextModule, PasswordModule,
    TagModule, DialogModule, SidebarModule, DropdownModule,
    ToastModule, ConfirmDialogModule, TooltipModule, CheckboxModule,
    ProgressSpinnerModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss'
})
export class UsuariosComponent implements OnInit {

  usuarios: Usuario[] = [];
  cargando = true;
  terminoBusqueda: string = '';

  get usuariosFiltrados(): Usuario[] {
    const q = (this.terminoBusqueda || '').trim().toLowerCase();
    if (!q) return this.usuarios;
    return this.usuarios.filter(u =>
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.rol && u.rol.toLowerCase().includes(q)) ||
      (u.id && u.id.toLowerCase().includes(q))
    );
  }

  // Modal nuevo usuario
  modalVisible  = false;
  nuevoEmail    = '';
  nuevoPassword = '';
  nuevoRol: RolGlobal = 'usuario';
  guardando     = false;
  errorModal    = '';

  // Drawer empresas
  drawerVisible       = false;
  usuarioSeleccionado: Usuario | null = null;
  todasLasEmpresas:   any[] = [];
  /** empresa_id → rol del usuario seleccionado en esa empresa. */
  empresasAsignadas = new Map<string, RolEmpresa>();
  guardandoEmpresas   = false;

  /** profiles.rol: el superadmin ve y gestiona todo; el resto depende de su rol en cada empresa. */
  tiposCuenta: { label: string; value: RolGlobal }[] = [
    { label: 'Usuario', value: 'usuario' },
    { label: 'Superadmin', value: 'admin' }
  ];

  rolesEmpresa: { label: string; value: RolEmpresa }[] = [
    { label: 'Vendedor', value: 'vendedor' },
    { label: 'Admin', value: 'admin' }
  ];

  get usuariosActivos(): number {
    return this.usuarios.filter(u => u.activo).length;
  }

  get usuariosAdmin(): number {
    return this.usuarios.filter(u => u.rol === 'admin').length;
  }

  get usuariosNormales(): number {
    return this.usuarios.filter(u => u.rol === 'usuario').length;
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
    this.cargando = true;
    try {
      this.usuarios = await this.supabase.getUsuarios();
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar los usuarios' });
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  // ── NUEVO USUARIO ────────────────────────────────
  abrirModal() {
    this.nuevoEmail    = '';
    this.nuevoPassword = '';
    this.nuevoRol      = 'usuario';
    this.errorModal    = '';
    this.modalVisible  = true;
  }

  cerrarModal() {
    this.modalVisible  = false;
    this.nuevoEmail    = '';
    this.nuevoPassword = '';
    this.nuevoRol      = 'usuario';
    this.errorModal    = '';
    this.guardando     = false;
  }

  async crearUsuario() {
    if (!this.nuevoEmail || !this.nuevoPassword) {
      this.errorModal = 'Email y contraseña son obligatorios.';
      this.cdr.markForCheck();
      return;
    }
    if (this.nuevoPassword.length < 6) {
      this.errorModal = 'La contraseña debe tener al menos 6 caracteres.';
      this.cdr.markForCheck();
      return;
    }
    this.guardando = true;
    this.errorModal = '';
    this.cdr.markForCheck();

    try {
      // Crear usuario y perfil de forma atómica mediante RPC sin colisión de correos ni cierre de sesión
      const res = await this.supabase.crearUsuario(this.nuevoEmail, this.nuevoPassword, this.nuevoRol);

      if (!res?.id) {
        throw new Error('No se pudo obtener la respuesta de creación de usuario.');
      }

      this.msg.add({ severity: 'success', summary: '¡Listo!', detail: `Usuario ${this.nuevoEmail} creado exitosamente` });
      this.modalVisible  = false;
      this.nuevoEmail    = '';
      this.nuevoPassword = '';
      this.nuevoRol      = 'usuario';
      this.errorModal    = '';
      await this.cargarUsuarios();
    } catch (err: any) {
      console.error('Error creando usuario:', err);
      this.errorModal = err?.message || err?.details || 'Error al crear el usuario.';
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  // ── ROL / ACTIVO ─────────────────────────────────
  async cambiarRol(usuario: Usuario, nuevoRol: RolGlobal) {
    if (!nuevoRol || nuevoRol === usuario.rol) return;

    const rolAnterior = usuario.rol;
    try {
      await this.supabase.actualizarRolUsuario(usuario.id, nuevoRol);
      usuario.rol = nuevoRol;
      this.msg.add({ severity: 'success', summary: 'Tipo de cuenta actualizado',
        detail: `${usuario.email || usuario.id}: ${nuevoRol === 'admin' ? 'Superadmin' : 'Usuario'}` });
    } catch (e: any) {
      usuario.rol = rolAnterior;
      this.msg.add({ severity: 'error', summary: 'No se cambió', detail: e?.message || 'No se pudo cambiar el tipo de cuenta' });
    } finally {
      this.cdr.markForCheck();
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
    } finally {
      this.cdr.markForCheck();
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
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'No se eliminó', detail: e?.message || 'No se pudo eliminar' });
    } finally {
      this.cdr.markForCheck();
    }
  }

  // ── DRAWER EMPRESAS ───────────────────────────────
  async abrirEmpresas(usuario: Usuario) {
    // Solo admin general tiene acceso a todas las empresas sin asignación
    if (usuario.rol === 'admin') {
      this.msg.add({ 
        severity: 'info', 
        summary: 'Acceso completo', 
        detail: 'Los administradores generales tienen acceso a todas las empresas automáticamente' 
      });
      return;
    }
    
    this.usuarioSeleccionado = usuario;
    this.empresasAsignadas   = new Map();
    this.drawerVisible       = true;      // abrir drawer primero
    this.cdr.markForCheck();             // forzar render del drawer

    try {
      const asignaciones = await this.supabase.getEmpresasDeUsuario(usuario.id);
      this.empresasAsignadas = new Map(asignaciones.map(a => [a.empresa_id, a.rol]));
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las empresas' });
    }

    this.cdr.markForCheck();
  }

  toggleEmpresa(empresaId: string) {
    if (this.empresasAsignadas.has(empresaId)) {
      this.empresasAsignadas.delete(empresaId);
    } else {
      this.empresasAsignadas.set(empresaId, 'vendedor');
    }
  }

  estaAsignada(empresaId: string): boolean {
    return this.empresasAsignadas.has(empresaId);
  }

  rolEnEmpresa(empresaId: string): RolEmpresa | null {
    return this.empresasAsignadas.get(empresaId) ?? null;
  }

  cambiarRolEnEmpresa(empresaId: string, rol: RolEmpresa) {
    if (this.empresasAsignadas.has(empresaId)) this.empresasAsignadas.set(empresaId, rol);
  }

  async guardarEmpresas() {
    if (!this.usuarioSeleccionado) return;
    this.guardandoEmpresas = true;
    try {
      await this.supabase.guardarEmpresasDeUsuario(
        this.usuarioSeleccionado.id,
        [...this.empresasAsignadas].map(([empresa_id, rol]) => ({ empresa_id, rol }))
      );
      this.msg.add({ severity: 'success', summary: '¡Guardado!',
        detail: `Empresas actualizadas para ${this.usuarioSeleccionado.email}` });
      this.drawerVisible = false;
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'No se guardó', detail: e?.message || 'No se pudo guardar' });
    } finally {
      this.guardandoEmpresas = false;
      this.cdr.markForCheck();
    }
  }
}
import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../services/supabase.service';
import { SessionContextService } from '../../services/session-context.service';

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
import { InputSwitchModule } from 'primeng/inputswitch';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { IAsignacionEmpresa, IEmpresa, RolEmpresa, RolGlobal } from '../../models';

interface Usuario {
  id: string;
  email?: string;
  nombre?: string | null;
  rol: RolGlobal;
  activo: boolean;
}

/** Lo que se muestra en la columna "Acceso": una etiqueta por empresa. */
export interface EtiquetaAcceso {
  texto: string;
  severidad: 'danger' | 'warning' | 'info' | 'secondary';
}

/**
 * Etiquetas de acceso de un usuario: el superadmin entra a todas las empresas;
 * el resto, a las asignadas, con su rol en cada una.
 */
export function etiquetasDeAcceso(
  usuario: Pick<Usuario, 'rol'>,
  asignaciones: IAsignacionEmpresa[],
  nombres: Map<string, string>
): EtiquetaAcceso[] {
  if (usuario.rol === 'admin') return [{ texto: 'Superadmin · todas las empresas', severidad: 'danger' }];
  if (asignaciones.length === 0) return [{ texto: 'Sin empresas', severidad: 'secondary' }];
  return [...asignaciones]
    .sort((a, b) => (nombres.get(a.empresa_id) ?? a.empresa_id).localeCompare(nombres.get(b.empresa_id) ?? b.empresa_id))
    .map(a => ({
      texto: `${nombres.get(a.empresa_id) ?? a.empresa_id} · ${a.rol === 'admin' ? 'Admin' : 'Vendedor'}`,
      severidad: a.rol === 'admin' ? 'warning' : 'info'
    }));
}

@Component({
  selector: 'app-usuarios',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    TableModule, ButtonModule, InputTextModule, PasswordModule,
    TagModule, DialogModule, SidebarModule, DropdownModule,
    ToastModule, ConfirmDialogModule, TooltipModule, CheckboxModule,
    InputSwitchModule, ProgressSpinnerModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './usuarios.html',
  styleUrl: './usuarios.scss'
})
export class UsuariosComponent implements OnInit {

  usuarios: Usuario[] = [];
  cargando = true;
  terminoBusqueda: string = '';

  todasLasEmpresas: IEmpresa[] = [];
  private nombresEmpresa = new Map<string, string>();
  private asignaciones = new Map<string, IAsignacionEmpresa[]>();

  // Modal nuevo usuario
  modalVisible   = false;
  nuevoNombre    = '';
  nuevoEmail     = '';
  nuevoPassword  = '';
  nuevoSuperadmin = false;
  guardando      = false;
  errorModal     = '';

  // Panel "Acceso" de un usuario
  drawerVisible       = false;
  usuarioSeleccionado: Usuario | null = null;
  borradorSuperadmin  = false;
  borradorNombre      = '';
  /** empresa_id → rol del usuario seleccionado en esa empresa. */
  empresasAsignadas = new Map<string, RolEmpresa>();
  guardandoAcceso     = false;

  rolesEmpresa: { label: string; value: RolEmpresa }[] = [
    { label: 'Vendedor', value: 'vendedor' },
    { label: 'Admin', value: 'admin' }
  ];

  constructor(
    private supabase: SupabaseService,
    private session: SessionContextService,
    private msg: MessageService,
    private confirm: ConfirmationService,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    await this.cargarTodo();
  }

  /** Usuarios, empresas y asignaciones a la vez: un solo tiempo de espera. */
  async cargarTodo() {
    this.cargando = true;
    try {
      const [usuarios, empresas, asignaciones] = await Promise.all([
        this.supabase.getUsuarios(),
        this.supabase.getEmpresas(),
        this.supabase.getAsignaciones()
      ]);
      this.usuarios = usuarios;
      this.todasLasEmpresas = empresas;
      this.nombresEmpresa = new Map(empresas.map(e => [e.id, e.nombre_comercial]));
      this.asignaciones = new Map();
      for (const a of asignaciones) {
        this.asignaciones.set(a.usuario_id, [...(this.asignaciones.get(a.usuario_id) ?? []), { empresa_id: a.empresa_id, rol: a.rol }]);
      }
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar los usuarios' });
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }

  // ── Listado ──────────────────────────────────────

  get usuariosFiltrados(): Usuario[] {
    const q = (this.terminoBusqueda || '').trim().toLowerCase();
    if (!q) return this.usuarios;
    return this.usuarios.filter(u =>
      (u.nombre && u.nombre.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.id && u.id.toLowerCase().includes(q)) ||
      this.acceso(u).some(e => e.texto.toLowerCase().includes(q))
    );
  }

  acceso(usuario: Usuario): EtiquetaAcceso[] {
    return etiquetasDeAcceso(usuario, this.asignaciones.get(usuario.id) ?? [], this.nombresEmpresa);
  }

  get usuariosActivos(): number {
    return this.usuarios.filter(u => u.activo).length;
  }

  get usuariosAdmin(): number {
    return this.usuarios.filter(u => u.rol === 'admin').length;
  }

  /** Cuentas que no son superadmin y no tienen ninguna empresa: no pueden hacer nada. */
  get usuariosSinEmpresas(): number {
    return this.usuarios.filter(u => u.rol !== 'admin' && !(this.asignaciones.get(u.id)?.length)).length;
  }

  esUnoMismo(usuario: Usuario | null): boolean {
    return !!usuario && usuario.id === this.session.usuario()?.id;
  }

  // ── Nuevo usuario ────────────────────────────────

  abrirModal() {
    this.nuevoNombre     = '';
    this.nuevoEmail      = '';
    this.nuevoPassword   = '';
    this.nuevoSuperadmin = false;
    this.errorModal      = '';
    this.modalVisible    = true;
  }

  cerrarModal() {
    this.modalVisible    = false;
    this.nuevoNombre     = '';
    this.nuevoEmail      = '';
    this.nuevoPassword   = '';
    this.nuevoSuperadmin = false;
    this.errorModal      = '';
    this.guardando       = false;
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
      const email = this.nuevoEmail.trim().toLowerCase();
      const res = await this.supabase.crearUsuario(email, this.nuevoPassword, this.nuevoSuperadmin ? 'admin' : 'usuario');
      if (!res?.id) {
        throw new Error('No se pudo obtener la respuesta de creación de usuario.');
      }
      // La cuenta ya existe: si esto falla no debe parecer que no se creó.
      if (this.nuevoNombre.trim()) {
        await this.supabase.actualizarNombreUsuario(res.id, this.nuevoNombre.trim()).catch(() => {
          this.msg.add({ severity: 'warn', summary: 'No se guardó el nombre', detail: 'Puedes ponerlo desde "Nombre y acceso".' });
        });
      }

      this.msg.add({ severity: 'success', summary: 'Usuario creado', detail: email });
      const esSuperadmin = this.nuevoSuperadmin;
      this.cerrarModal();
      await this.cargarTodo();

      // Un usuario normal sin empresas no puede hacer nada: se abre su acceso.
      const nuevo = this.usuarios.find(u => u.id === res.id);
      if (nuevo && !esSuperadmin) this.abrirAcceso(nuevo);
    } catch (err: any) {
      console.error('Error creando usuario:', err);
      this.errorModal = err?.message || err?.details || 'Error al crear el usuario.';
    } finally {
      this.guardando = false;
      this.cdr.markForCheck();
    }
  }

  // ── Activar / eliminar ───────────────────────────

  async toggleActivo(usuario: Usuario) {
    if (this.esUnoMismo(usuario)) {
      this.msg.add({ severity: 'warn', summary: 'No permitido', detail: 'No puedes desactivar tu propia cuenta.' });
      return;
    }
    const nuevo = !usuario.activo;
    try {
      await this.supabase.toggleActivoUsuario(usuario.id, nuevo);
      usuario.activo = nuevo;
    } catch {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cambiar el estado' });
    } finally {
      this.cdr.markForCheck();
    }
  }

  confirmarEliminar(usuario: Usuario) {
    this.confirm.confirm({
      message: `¿Eliminar permanentemente a ${usuario.email || 'este usuario'}?`,
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
      this.asignaciones.delete(usuario.id);
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'No se eliminó', detail: e?.message || 'No se pudo eliminar' });
    } finally {
      this.cdr.markForCheck();
    }
  }

  // ── Panel "Acceso" ───────────────────────────────

  abrirAcceso(usuario: Usuario) {
    this.usuarioSeleccionado = usuario;
    this.borradorSuperadmin  = usuario.rol === 'admin';
    this.borradorNombre      = usuario.nombre ?? '';
    this.empresasAsignadas   = new Map((this.asignaciones.get(usuario.id) ?? []).map(a => [a.empresa_id, a.rol]));
    this.drawerVisible       = true;
    this.cdr.markForCheck();
  }

  toggleEmpresa(empresaId: string) {
    if (this.borradorSuperadmin) return;
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

  guardarAcceso() {
    const usuario = this.usuarioSeleccionado;
    if (!usuario) return;
    const eraSuperadmin = usuario.rol === 'admin';

    if (eraSuperadmin && !this.borradorSuperadmin && this.esUnoMismo(usuario)) {
      this.msg.add({ severity: 'warn', summary: 'No permitido', detail: 'No puedes quitarte tu propio acceso de superadmin.' });
      return;
    }
    if (!eraSuperadmin && this.borradorSuperadmin) {
      this.confirm.confirm({
        header: 'Dar acceso total',
        message: `${usuario.email || 'Este usuario'} podrá ver y cambiar todas las empresas, usuarios y cotizaciones. ¿Continuar?`,
        icon: 'pi pi-shield',
        acceptLabel: 'Sí, hacer superadmin',
        rejectLabel: 'Cancelar',
        acceptButtonStyleClass: 'p-button-danger',
        accept: () => this.persistirAcceso(usuario)
      });
      return;
    }
    this.persistirAcceso(usuario);
  }

  private async persistirAcceso(usuario: Usuario) {
    this.guardandoAcceso = true;
    this.cdr.markForCheck();
    try {
      const nombre = this.borradorNombre.trim() || null;
      if (nombre !== (usuario.nombre ?? null)) {
        await this.supabase.actualizarNombreUsuario(usuario.id, nombre);
        usuario.nombre = nombre;
      }
      const nuevoRol: RolGlobal = this.borradorSuperadmin ? 'admin' : 'usuario';
      if (nuevoRol !== usuario.rol) {
        await this.supabase.actualizarRolUsuario(usuario.id, nuevoRol);
        usuario.rol = nuevoRol;
      }
      // Al superadmin no le hacen falta asignaciones: se conservan como estaban.
      if (!this.borradorSuperadmin) {
        const asignaciones = [...this.empresasAsignadas].map(([empresa_id, rol]) => ({ empresa_id, rol }));
        await this.supabase.guardarEmpresasDeUsuario(usuario.id, asignaciones);
        this.asignaciones.set(usuario.id, asignaciones);
      }
      this.msg.add({ severity: 'success', summary: 'Acceso guardado', detail: usuario.email || usuario.id });
      this.drawerVisible = false;
    } catch (e: any) {
      this.msg.add({ severity: 'error', summary: 'No se guardó', detail: e?.message || 'No se pudo guardar el acceso' });
    } finally {
      this.guardandoAcceso = false;
      this.cdr.markForCheck();
    }
  }
}

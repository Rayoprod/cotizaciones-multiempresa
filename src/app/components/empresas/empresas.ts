import { Component, OnInit, ChangeDetectorRef, ChangeDetectionStrategy, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, Validators, FormArray } from '@angular/forms';

import { IEmpresa, ICuentaBancaria } from '../../models/empresa.model';
import { SupabaseService } from '../../services/supabase.service';
import { ApiPeruService } from '../../services/api-peru.service';
import {
  prepararImagen, blobADataUrl, dataUrlABlob, extensionDeImagen, PESO_MAXIMO_IMAGEN
} from '../../services/imagenes';
import { EmpresaValidators } from '../../validators/empresa.validators';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToggleButtonModule } from 'primeng/togglebutton';
import { ColorPickerModule } from 'primeng/colorpicker';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextareaModule } from 'primeng/inputtextarea';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { InputNumberModule } from 'primeng/inputnumber';
import { ChipsModule } from 'primeng/chips';

import { SessionContextService } from '../../services/session-context.service';
import { EmpresasUsuarioService } from '../../services/empresas-usuario.service';

@Component({
  selector: 'app-empresas',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    TableModule, ButtonModule, InputTextModule, InputNumberModule,
    DialogModule, ToggleButtonModule, ColorPickerModule,
    ToastModule, TagModule, TooltipModule, ConfirmDialogModule,
    ProgressSpinnerModule, InputTextareaModule, ChipsModule
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './empresas.html',
  styleUrls: ['./empresas.scss']
})
export class EmpresasComponent implements OnInit {
  
  empresas: IEmpresa[] = [];
  cargando = true;
  empresaDialog = false;
  esEdicion = false;
  enviando = false;
  esAdminGeneral = false;
  esAdminEmpresa = false;
  terminoBusqueda: string = '';
  empresaActual: IEmpresa | null = null;

  get empresasFiltradas(): IEmpresa[] {
    const q = (this.terminoBusqueda || '').trim().toLowerCase();
    if (!q) return this.empresas;
    return this.empresas.filter(e =>
      (e.id && e.id.toLowerCase().includes(q)) ||
      (e.nombre_comercial && e.nombre_comercial.toLowerCase().includes(q)) ||
      (e.razon_social && e.razon_social.toLowerCase().includes(q)) ||
      (e.ruc && e.ruc.includes(q))
    );
  }
  
  empresaForm!: FormGroup;
  cuentasFormArray!: FormArray;
  
  // Tope del archivo elegido; antes de subirlo se reduce a 800 px (ver imagenes.ts).
  readonly MAX_FILE_SIZE = 10 * 1024 * 1024;
  readonly SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];

  constructor(
    private supabase: SupabaseService,
    private apiPeru: ApiPeruService,
    private fb: FormBuilder,
    private msg: MessageService,
    private confirm: ConfirmationService,
    private cdr: ChangeDetectorRef,
    private session: SessionContextService,
    private empresasUsuario: EmpresasUsuarioService,
    @Inject(DOCUMENT) public document: Document
  ) {}
  
  ngOnInit() {
    this.esAdminGeneral = this.session.esSuperadmin();
    this.esAdminEmpresa = !this.esAdminGeneral;
    this.inicializarFormularios();
    this.cargarEmpresas();
    // Versiones anteriores guardaban aquí el formulario (con cuentas
    // bancarias) cada 2 s y nunca lo leían.
    try { localStorage.removeItem('empresa_borrador'); } catch { /* sin almacenamiento */ }
  }
  
  private inicializarFormularios() {
    const idOriginal = this.esEdicion ? this.empresaActual?.id : undefined;
    const rucOriginal = this.esEdicion ? this.empresaActual?.ruc : undefined;

    this.empresaForm = this.fb.group({
      id: ['', [Validators.required, Validators.pattern(/^[A-Z0-9]{2,10}$/)], 
           this.esEdicion ? [] : [EmpresaValidators.idUnico(this.supabase, idOriginal)]],
      nombre_comercial: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
      razon_social: ['', Validators.maxLength(200)],
      ruc: ['', [Validators.required, Validators.pattern(/^[0-9]{11}$/)], 
           this.esEdicion ? [] : [EmpresaValidators.rucUnico(this.supabase, rucOriginal)]],
      color: ['#01696f', Validators.required],
      direccion: ['', Validators.maxLength(300)],
      telefonos: ['', Validators.maxLength(100)],
      correo: ['', [Validators.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)]],
      ruta_logo: ['', [Validators.pattern(/^(https?:\/\/.+|data:image\/[^;]+;base64,.+)$/)]],
      ruta_firma: ['', [Validators.pattern(/^(https?:\/\/.+|data:image\/[^;]+;base64,.+)$/)]],
      prefijo: ['', [Validators.required, Validators.pattern(/^[A-Z0-9]{1,5}$/)],
           [EmpresaValidators.prefijoUnico(this.supabase, this.esEdicion ? this.empresaActual?.prefijo : undefined)]],
      activa: [true],
      mostrar_cuentas: [true],
      contacto_aprobacion: ['', Validators.maxLength(200)],
      lugares_entrega: [[] as string[]],
      cuentas_bancarias: this.fb.array([])
    });
    
    this.cuentasFormArray = this.empresaForm.get('cuentas_bancarias') as FormArray;
  }
  
  async cargarEmpresas() {
    this.cargando = true;
    try {
      let data: IEmpresa[];

      if (this.esAdminGeneral) {
        data = await this.supabase.getEmpresasDelUsuario(true);
      } else {
        // Un admin de empresa solo ve las empresas donde tiene rol admin.
        data = (await this.empresasUsuario.obtener()).filter(e => e.mi_rol === 'admin');
      }

      this.empresas = data;
    } catch (error: any) {
      this.msg.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las empresas: ' + error.message });
    } finally {
      this.cargando = false;
      this.cdr.markForCheck();
    }
  }
  
  // ── GESTIÓN DEL MODAL ───────────────────────────────────────────────
  
  abrirNuevo() {
    this.esEdicion = false;
    this.empresaDialog = true;
    this.empresaActual = null;
    this.resetearFormulario();
  }
  
  editarEmpresa(empresa: IEmpresa) {
    
    this.esEdicion = true;
    this.empresaActual = empresa;
    
    try {
      this.inicializarFormularios();
      this.cargarDatosEnFormulario(empresa);
      this.empresaForm.get('id')?.disable();
      this.empresaDialog = true;
    } catch (error) {
      console.error('❌ Error al preparar edición:', error);
      this.msg.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo preparar la edición de la empresa'
      });
    }
  }
  
  cerrarModal() {
    this.empresaDialog = false;
    this.resetearFormulario();
    this.empresaActual = null;
  }
  
  // ── FORMULARIO ───────────────────────────────────────────────────────
  
  private resetearFormulario() {
    this.empresaForm.reset();
    this.empresaForm.patchValue({
      id: '',
      nombre_comercial: '',
      razon_social: '',
      ruc: '',
      color: '#01696f',
      direccion: '',
      telefonos: '',
      correo: '',
      ruta_logo: '',
      ruta_firma: '',
      prefijo: '',
      activa: true,
      mostrar_cuentas: true,
      contacto_aprobacion: '',
      lugares_entrega: []
    });
    this.cuentasFormArray.clear();
    
    this.empresaForm.get('id')?.enable();
  }
  
  private cargarDatosEnFormulario(empresa: IEmpresa) {
    
    this.empresaForm.patchValue({
      id: empresa.id,
      nombre_comercial: empresa.nombre_comercial,
      razon_social: (empresa.razon_social || '').trim(),
      ruc: empresa.ruc,
      color: empresa.color,
      direccion: (empresa.direccion || '').trim(),
      telefonos: (empresa.telefonos || '').trim(),
      correo: (empresa.correo || '').trim(),
      ruta_logo: empresa.ruta_logo || '',
      ruta_firma: empresa.ruta_firma || '',
      prefijo: (empresa.prefijo || '').trim(),
      activa: empresa.activa,
      mostrar_cuentas: empresa.mostrar_cuentas ?? true,
      contacto_aprobacion: (empresa.contacto_aprobacion || '').trim(),
      lugares_entrega: [...(empresa.lugares_entrega ?? [])]
    });
    
    
    this.cuentasFormArray.clear();
    if (empresa.cuentas_bancarias && empresa.cuentas_bancarias.length > 0) {
      empresa.cuentas_bancarias.forEach(cuenta => {
        this.agregarCuenta(cuenta);
      });
    }
  }
  
  // ── CUENTAS BANCARIAS ─────────────────────────────────────────────────
  
  agregarCuenta(cuenta?: ICuentaBancaria) {
    
    const cuentaLimpia: ICuentaBancaria = {
      banco: (cuenta?.banco || '').trim(),
      tipo_cuenta: (cuenta?.tipo_cuenta || 'corriente').trim(),
      numero: (cuenta?.numero || '').trim(),
      cci: (cuenta?.cci || '').trim(),
      moneda: cuenta?.moneda || 'PEN',
    };
    
    
    const cuentaGroup = this.fb.group({
      banco: [cuentaLimpia.banco, Validators.required],
      tipo_cuenta: [cuentaLimpia.tipo_cuenta, Validators.required],
      numero: [cuentaLimpia.numero, [Validators.required, Validators.minLength(6), Validators.maxLength(30)]],
      cci: [cuentaLimpia.cci, [Validators.minLength(20), Validators.maxLength(20)]]
    });
    
    try {
      this.cuentasFormArray.push(cuentaGroup);
    } catch (error) {
      console.error('❌ Error al agregar cuenta:', error);
    }
  }
  
  eliminarCuenta(index: number) {
    this.cuentasFormArray.removeAt(index);
  }
  
  get cuentasBancarias() {
    return this.empresaForm.get('cuentas_bancarias') as FormArray;
  }
  
  // ── VALIDACIONES ─────────────────────────────────────────────────────
  
  getErrorMensaje(controlName: string, errorName: string): string {
    const control = this.empresaForm.get(controlName);
    if (!control || !control.errors) return '';
    
    const errors = control.errors;
    switch (errorName) {
      case 'required': return 'Este campo es obligatorio';
      case 'minlength': return `Mínimo ${errors['minlength'].requiredLength} caracteres`;
      case 'maxlength': return `Máximo ${errors['maxlength'].requiredLength} caracteres`;
      case 'pattern': return 'Formato inválido';
      case 'email': return 'Email inválido';
      case 'idDuplicado': return errors['idDuplicado'];
      case 'rucDuplicado': return errors['rucDuplicado'];
      case 'rucInvalido': return 'RUC inválido';
      default: return 'Error de validación';
    }
  }
  
  getCuentaErrorMensaje(index: number, controlName: string, errorName: string): string {
    const control = this.cuentasFormArray.at(index).get(controlName);
    if (!control || !control.errors) return '';
    
    const errors = control.errors;
    switch (errorName) {
      case 'required': return 'Este campo es obligatorio';
      case 'pattern': return 'Solo se permiten números';
      case 'minlength': return `Mínimo ${errors['minlength'].requiredLength} caracteres`;
      case 'maxlength': return `Máximo ${errors['maxlength'].requiredLength} caracteres`;
      default: return 'Error de validación';
    }
  }

  // ── API PERU ─────────────────────────────────────────────────────────
  
  async consultarRUC() {
    const rucControl = this.empresaForm.get('ruc');
    if (!rucControl || !rucControl.value || rucControl.value.length !== 11) {
      this.msg.add({
        severity: 'warn',
        summary: 'RUC inválido',
        detail: 'Ingresa un RUC de 11 dígitos'
      });
      return;
    }
    
    try {
      this.msg.add({
        severity: 'info',
        summary: 'Consultando RUC',
        detail: 'Obteniendo información de SUNAT...'
      });
      
      const data = await this.apiPeru.buscarDocumento(rucControl.value);
      const razon = data.nombre;
      const patchData: any = {
        razon_social: razon,
        direccion: data.direccion
      };

      if (!this.empresaForm.get('prefijo')?.value) {
        patchData.prefijo = this.generarPrefijo(razon);
      }

      if (!this.empresaForm.get('nombre_comercial')?.value) {
        patchData.nombre_comercial = razon;
      }

      this.empresaForm.patchValue(patchData);

      this.msg.add({
        severity: 'success',
        summary: 'RUC encontrado',
        detail: `Datos de ${razon} cargados`
      });
    } catch (error: any) {
      this.msg.add({
        severity: 'warn',
        summary: 'RUC no encontrado',
        detail: error?.message || 'No se pudo consultar el RUC.'
      });
    }
  }
  
  // ── UPLOAD DE ARCHIVOS ───────────────────────────────────────────────
  
  // La imagen elegida se reduce y queda como vista previa en el formulario;
  // se sube a Storage recién al guardar la empresa (ver subirImagenesPendientes).

  subirLogo(event: any) {
    return this.cargarImagen(event, 'ruta_logo', 'Logo');
  }

  subirFirma(event: any) {
    return this.cargarImagen(event, 'ruta_firma', 'Firma');
  }

  private async cargarImagen(event: any, campo: 'ruta_logo' | 'ruta_firma', nombre: string) {
    const file: File | undefined = event.target.files[0];
    event.target.value = '';
    if (!file || !this.validarArchivo(file)) return;

    try {
      const imagen = await prepararImagen(file);
      if (imagen.size > PESO_MAXIMO_IMAGEN) {
        this.msg.add({ severity: 'error', summary: 'Imagen muy pesada', detail: `${nombre}: incluso reducida supera los 2 MB.` });
        return;
      }
      this.empresaForm.patchValue({ [campo]: await blobADataUrl(imagen) });
      this.msg.add({ severity: 'info', summary: `${nombre} listo`, detail: 'Se subirá al guardar la empresa.' });
    } catch (error: any) {
      console.error(`Error preparando ${nombre}:`, error);
      this.msg.add({ severity: 'error', summary: 'Error', detail: `No se pudo procesar la imagen: ${error?.message ?? ''}` });
    } finally {
      this.cdr.markForCheck();
    }
  }

  /**
   * Sube a Storage las imágenes que estén como data URL (recién elegidas o
   * heredadas de cuando se guardaban en base64) y devuelve las URLs.
   */
  private async subirImagenesPendientes(empresaId: string, datos: { ruta_logo?: string; ruta_firma?: string }) {
    const resultado = { ...datos };
    for (const [campo, tipo] of [['ruta_logo', 'logo'], ['ruta_firma', 'firma']] as const) {
      const valor = datos[campo];
      if (!valor?.startsWith('data:')) continue;
      const imagen = await prepararImagen(await dataUrlABlob(valor));
      resultado[campo] = await this.supabase.subirImagenEmpresa(empresaId, tipo, imagen, extensionDeImagen(imagen.type));
    }
    return resultado;
  }

  private validarArchivo(file: File): boolean {
    if (file.size > this.MAX_FILE_SIZE) {
      this.msg.add({
        severity: 'error',
        summary: 'Archivo muy grande',
        detail: `Máximo ${this.MAX_FILE_SIZE / 1024 / 1024} MB por imagen`
      });
      return false;
    }
    
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (!extension || !this.SUPPORTED_FORMATS.includes(extension)) {
      this.msg.add({
        severity: 'error',
        summary: 'Formato no soportado',
        detail: `Formatos permitidos: ${this.SUPPORTED_FORMATS.join(', ')}` 
      });
      return false;
    }
    
    return true;
  }
  
  // ── GUARDADO ─────────────────────────────────────────────────────────
  
  async guardarEmpresa() {

    this.empresaForm.markAllAsTouched();

    const camposPrincipales = ['nombre_comercial', 'ruc', 'color', 'prefijo'];
    const hayErrorEnPrincipales = camposPrincipales.some(campo => {
      const ctrl = this.empresaForm.get(campo);
      return ctrl?.invalid && ctrl?.errors;
    });


    if (hayErrorEnPrincipales) {
      this.msg.add({
        severity: 'warn',
        summary: 'Formulario inválido',
        detail: 'Por favor completa todos los campos requeridos'
      });
      return;
    }

    if (this.cuentasFormArray.length > 0 && this.cuentasFormArray.invalid) {
      this.msg.add({
        severity: 'warn',
        summary: 'Cuentas incompletas',
        detail: 'Completa o elimina las cuentas bancarias con datos faltantes'
      });
      return;
    }

    this.enviando = true;

    try {
      const idControl = this.empresaForm.get('id');
      const idValue = idControl?.disabled ? idControl?.value : this.empresaForm.value.id;


      const formData = {
        ...this.empresaForm.value,
        id: idValue,
        lugares_entrega: normalizarLugares(this.empresaForm.value.lugares_entrega)
      };


      if (!idValue || idValue.trim() === '') {
        this.msg.add({
          severity: 'error',
          summary: 'Error',
          detail: 'El ID de la empresa es requerido'
        });
        return;
      }

      if (!formData.nombre_comercial || formData.nombre_comercial.trim() === '') {
        this.msg.add({
          severity: 'error',
          summary: 'Error',
          detail: 'El nombre comercial es requerido'
        });
        return;
      }

      if (!this.esEdicion) {
        const idExiste = await this.supabase.verificarIdExistente(formData.id);
        if (idExiste) {
          this.msg.add({
            severity: 'error',
            summary: 'ID duplicado',
            detail: 'El ID ya existe en la base de datos'
          });
          return;
        }

        const rucExiste = await this.supabase.verificarRucExistente(formData.ruc);
        if (rucExiste) {
          this.msg.add({
            severity: 'error',
            summary: 'RUC duplicado',
            detail: 'El RUC ya existe en la base de datos'
          });
          return;
        }
      }

      let imagenes;
      try {
        imagenes = await this.subirImagenesPendientes(formData.id, formData);
      } catch (error: any) {
        console.error('Error subiendo imágenes:', error);
        this.msg.add({
          severity: 'error', summary: 'No se guardó la empresa',
          detail: 'No se pudo subir el logo o la firma: ' + (error?.message ?? 'error desconocido')
        });
        return;
      }

      await this.supabase.guardarEmpresa({ ...formData, ...imagenes });

      await this.supabase.sincronizarCuentasBancarias(
        formData.id,
        (formData.cuentas_bancarias || []).filter((c: any) => c.banco?.trim() && c.numero?.trim())
      );

      this.msg.add({
        severity: 'success',
        summary: 'Empresa guardada',
        detail: this.esEdicion ? 'Empresa actualizada correctamente' : 'Empresa creada correctamente'
      });

      this.cerrarModal();
      // Logo, lugares o cuentas nuevas: que el resto de la app tome la versión guardada.
      this.empresasUsuario.invalidar();
      await Promise.all([this.empresasUsuario.obtener(true), this.cargarEmpresas()]);

    } catch (error: any) {
      console.error('Error guardando empresa:', error);
      this.msg.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo guardar la empresa: ' + error.message
      });
    } finally {
      this.enviando = false;
    }
  }

  getBotonLabel(): string {
    return this.esEdicion ? 'Actualizar' : 'Guardar';
  }

  // ── ELIMINACIÓN ───────────────────────────────────────────────────────
  
  async eliminarEmpresa(id: string) {
    this.confirm.confirm({
      message: '¿Estás seguro de eliminar esta empresa? Esta acción no se puede deshacer.',
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      accept: async () => {
        try {
          await this.supabase.eliminarEmpresa(id);
          this.empresas = this.empresas.filter(e => e.id !== id);
          
          this.msg.add({
            severity: 'success',
            summary: 'Empresa eliminada',
            detail: 'La empresa fue eliminada correctamente'
          });
        } catch (error: any) {
          console.error('Error eliminando empresa:', error);
          this.msg.add({
            severity: 'error',
            summary: 'Error',
            detail: 'No se pudo eliminar la empresa'
          });
        }
      }
    });
  }
  
  // ── UTILIDADES ───────────────────────────────────────────────────────

  get colorEmpresa(): string {
    return this.empresaForm.get('color')?.value || '#01696f';
  }
  
  get tieneCuentas(): boolean {
    return this.cuentasFormArray.length > 0;
  }
  
  get prefijoEjemplo(): string {
    const prefijo = this.empresaForm.get('prefijo')?.value || 'A';
    return `${prefijo}-001`;
  }

  get empresasActivasCount(): number {
    return this.empresas.filter(e => e.activa).length;
  }

  get empresasInactivasCount(): number {
    return this.empresas.filter(e => !e.activa).length;
  }

  generarPrefijo(razonSocial: string): string {
    if (!razonSocial) return '';
    const palabras = razonSocial
      .replace(/[^A-Za-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(p => p.length > 1 && !['SAC','SRL','EIRL','SA','SAA','SAS','DE','DEL','LA','EL','LOS','LAS','Y'].includes(p.toUpperCase()));

    let prefijo = '';
    if (palabras.length >= 2) {
      prefijo = palabras.slice(0, 3).map(p => p[0]).join('').toUpperCase();
    } else if (palabras.length === 1) {
      prefijo = palabras[0].substring(0, 3).toUpperCase();
    }

    return prefijo || razonSocial.substring(0, 2).toUpperCase();
  }

  forzarMayusculas(controlName: string) {
    const control = this.empresaForm.get(controlName);
    if (control?.value) {
      control.setValue(control.value.toUpperCase(), { emitEvent: false });
    }
  }
}

/** Lugares de entrega sin espacios sobrantes, vacíos ni repetidos. */
export function normalizarLugares(lugares: string[] | null | undefined): string[] {
  const vistos = new Set<string>();
  return (lugares ?? [])
    .map(l => String(l ?? '').trim().replace(/\s+/g, ' ').slice(0, 100))
    .filter(l => l && !vistos.has(l.toLowerCase()) && vistos.add(l.toLowerCase()));
}

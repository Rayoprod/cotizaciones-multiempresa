import { Component, OnInit, OnDestroy, ChangeDetectorRef, Inject } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { FormBuilder, FormGroup, Validators, FormArray, FormControl, AbstractControl } from '@angular/forms';

import { IEmpresa, ICuentaBancaria } from '../../models/empresa.model';
import { SupabaseService } from '../../services/supabase.service';
import { ApiPeruService } from '../../services/api-peru.service';
import { EmpresaValidators } from '../../validators/empresa.validators';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DialogModule } from 'primeng/dialog';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { ColorPickerModule } from 'primeng/colorpicker';
import { ToastModule } from 'primeng/toast';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { TextareaModule } from 'primeng/textarea';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { InputNumberModule } from 'primeng/inputnumber';

import { Observable, Subject, of, timer } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';

@Component({
  selector: 'app-empresas',
  standalone: true,
  imports: [
    CommonModule, FormsModule, ReactiveFormsModule,
    TableModule, ButtonModule, InputTextModule, InputNumberModule,
    DialogModule, ToggleSwitchModule, ColorPickerModule,
    ToastModule, TagModule, TooltipModule, ConfirmDialogModule,
    ProgressSpinnerModule, TextareaModule
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './empresas.html',
  styleUrls: ['./empresas.scss']
})
export class EmpresasComponent implements OnInit, OnDestroy {
  
  // ── ESTADO ────────────────────────────────────────────────────────
  
  empresas: IEmpresa[] = [];
  empresaDialog = false;
  esEdicion = false;
  enviando = false;
  empresaActual: IEmpresa | null = null;
  
  // Formularios reactivos
  empresaForm!: FormGroup;
  cuentasFormArray!: FormArray;
  
  // Configuración
  readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  readonly SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
  
  // Observables para gestión de estado
  private destroy$ = new Subject<void>();
  private autoSaveTimer$ = new Subject<void>();
  
  constructor(
    private supabase: SupabaseService,
    private apiPeru: ApiPeruService,
    private fb: FormBuilder,
    private msg: MessageService,
    private confirm: ConfirmationService,
    private cdr: ChangeDetectorRef,
    @Inject(DOCUMENT) public document: Document
  ) {}
  
  // ── INICIALIZACIÓN ──────────────────────────────────────────────────
  
  ngOnInit() {
    this.inicializarFormularios();
    this.configurarAutosave();
    this.cargarEmpresas();
  }
  
  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
    this.autoSaveTimer$.next();
    this.autoSaveTimer$.complete();
  }
  
  private inicializarFormularios() {
    // Obtener el ID original si estamos editando
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
      cuentas_bancarias: this.fb.array([])
    });
    
    // FormArray para cuentas bancarias
    this.cuentasFormArray = this.empresaForm.get('cuentas_bancarias') as FormArray;
  }
  
  private configurarAutosave() {
    // Configurar autosave para el formulario
    this.empresaForm.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(2000),
        distinctUntilChanged((prev, curr) => JSON.stringify(prev) === JSON.stringify(curr))
      )
      .subscribe(() => {
        if (this.empresaDialog && this.empresaForm.valid) {
          this.guardarBorrador();
        }
      });
  }
  
  // ── CARGA DE DATOS ──────────────────────────────────────────────────
  
  async cargarEmpresas() {
    try {
      console.log('🔄 Cargando empresas...');
      const rol = localStorage.getItem('usuario_rol');
      let data: any[];

      if (rol === 'admin_empresa') {
        data = await this.supabase.getEmpresasDelUsuario();
      } else {
        data = await this.supabase.getEmpresas();
      }
      console.log('✅ Empresas cargadas:', data);
      
      const empresasConCuentas = await Promise.all(
        data.map(async (empresa: any) => {
          try {
            const cuentasDB = await this.supabase.getCuentasBancarias(empresa.id);
            if (cuentasDB.length > 0) {
              return {
                ...empresa,
                cuentas_bancarias: cuentasDB.map((c: any) => ({
                  banco: c.banco,
                  tipo_cuenta: c.tipo_cuenta,
                  moneda: c.moneda,
                  numero: c.numero,
                  cci: c.cci || '',
                  titular: c.titular || '',
                  activa: c.activa,
                  orden: c.orden
                }))
              };
            }
          } catch {}
          return {
            ...empresa,
            cuentas_bancarias: Array.isArray(empresa.cuentas_bancarias) ? empresa.cuentas_bancarias : [],
            mostrar_cuentas: empresa.mostrar_cuentas ?? true,
            activa: empresa.activa ?? true
          };
        })
      );
      
      this.empresas = empresasConCuentas;
      
      this.cdr.detectChanges();
      
    } catch (error: any) {
      console.error('❌ Error cargando empresas:', error);
      this.msg.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudieron cargar las empresas: ' + error.message
      });
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
    console.log('🔄 Iniciando edición de empresa:', empresa);
    
    this.esEdicion = true;
    this.empresaActual = empresa;
    
    try {
      // Re-inicializar el formulario para el modo edición
      this.inicializarFormularios();
      
      // Cargar los datos de la empresa
      this.cargarDatosEnFormulario(empresa);
      
      // Deshabilitar ID en edición
      this.empresaForm.get('id')?.disable();
      
      // Abrir el diálogo
      this.empresaDialog = true;
      
      console.log('✅ Empresa cargada para edición exitosamente');
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
      contacto_aprobacion: ''
    });
    this.cuentasFormArray.clear();
    
    // Rehabilitar ID si estaba deshabilitado
    this.empresaForm.get('id')?.enable();
  }
  
  private cargarDatosEnFormulario(empresa: IEmpresa) {
    console.log('📝 Cargando datos en formulario...');
    console.log('🏢 Empresa a cargar:', empresa);
    console.log('🆔 ID de la empresa:', empresa.id);
    
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
      contacto_aprobacion: (empresa.contacto_aprobacion || '').trim()
    });
    
    console.log('✅ Datos cargados en formulario');
    console.log('📋 Valor del ID después de cargar:', this.empresaForm.get('id')?.value);
    
    // Cargar cuentas bancarias
    this.cuentasFormArray.clear();
    if (empresa.cuentas_bancarias && empresa.cuentas_bancarias.length > 0) {
      empresa.cuentas_bancarias.forEach(cuenta => {
        this.agregarCuenta(cuenta);
      });
    }
  }
  
  // ── CUENTAS BANCARIAS ─────────────────────────────────────────────────
  
  agregarCuenta(cuenta?: ICuentaBancaria) {
    console.log('➕ Agregando cuenta bancaria:', cuenta);
    console.log('📋 FormArray actual:', this.cuentasFormArray.controls);
    console.log('📋 Longitud actual:', this.cuentasFormArray.length);
    
    // Limpiar y validar los datos de la cuenta
    const cuentaLimpia: ICuentaBancaria = {
      banco: (cuenta?.banco || '').trim(),
      tipo_cuenta: (cuenta?.tipo_cuenta || 'corriente').trim(),
      numero: (cuenta?.numero || '').trim(),
      cci: (cuenta?.cci || '').trim()
    };
    
    console.log('🧹 Cuenta limpia:', cuentaLimpia);
    
    const cuentaGroup = this.fb.group({
  banco: [cuentaLimpia.banco, Validators.required],
  tipo_cuenta: [cuentaLimpia.tipo_cuenta, Validators.required],
  numero: [cuentaLimpia.numero, [Validators.required, Validators.minLength(6), Validators.maxLength(30)]],
  cci: [cuentaLimpia.cci, [Validators.minLength(20), Validators.maxLength(20)]]  // CCI es siempre 20 dígitos o vacío
});
    
    try {
      this.cuentasFormArray.push(cuentaGroup);
      console.log('✅ Cuenta agregada exitosamente');
      console.log('📋 FormArray después de agregar:', this.cuentasFormArray.controls);
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
      
      if (data && data.success) {
        const razon = data.razonSocial || '';
        const patchData: any = {
          razon_social: razon,
          direccion: data.direccion || ''
        };

        // Auto-generar prefijo si está vacío
        if (!this.empresaForm.get('prefijo')?.value) {
          patchData.prefijo = this.generarPrefijo(razon);
        }

        // Auto-generar nombre comercial si está vacío
        if (!this.empresaForm.get('nombre_comercial')?.value) {
          patchData.nombre_comercial = razon;
        }

        this.empresaForm.patchValue(patchData);
        
        this.msg.add({
          severity: 'success',
          summary: 'RUC encontrado',
          detail: `Datos de ${razon} cargados`
        });
      } else {
        this.msg.add({
          severity: 'warn',
          summary: 'RUC no encontrado',
          detail: 'No se encontró información para este RUC'
        });
      }
    } catch (error: any) {
      console.error('Error consultando RUC:', error);
      this.msg.add({
        severity: 'error',
        summary: 'Error de consulta',
        detail: 'No se pudo consultar el RUC: ' + error.message
      });
    }
  }
  
  // ── UPLOAD DE ARCHIVOS ───────────────────────────────────────────────
  
  async subirLogo(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!this.validarArchivo(file)) return;
    
    try {
      const base64 = await this.convertirABase64(file);
      // El resultado ya incluye el prefijo data:, no necesitamos agregarlo
      this.empresaForm.patchValue({
        ruta_logo: base64
      });
      
      this.msg.add({
        severity: 'success',
        summary: 'Logo subido',
        detail: 'El logo se cargó correctamente'
      });
      
      // Limpiar el input para permitir seleccionar el mismo archivo nuevamente
      event.target.value = '';
    } catch (error: any) {
      console.error('Error subiendo logo:', error);
      this.msg.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo subir el logo: ' + error.message
      });
      
      // Limpiar el input en caso de error
      event.target.value = '';
    }
  }
  
  async subirFirma(event: any) {
    const file = event.target.files[0];
    if (!file) return;
    
    if (!this.validarArchivo(file)) return;
    
    try {
      const base64 = await this.convertirABase64(file);
      // El resultado ya incluye el prefijo data:, no necesitamos agregarlo
      this.empresaForm.patchValue({
        ruta_firma: base64
      });
      
      this.msg.add({
        severity: 'success',
        summary: 'Firma subida',
        detail: 'La firma se cargó correctamente'
      });
      
      // Limpiar el input para permitir seleccionar el mismo archivo nuevamente
      event.target.value = '';
    } catch (error: any) {
      console.error('Error subiendo firma:', error);
      this.msg.add({
        severity: 'error',
        summary: 'Error',
        detail: 'No se pudo subir la firma: ' + error.message
      });
      
      // Limpiar el input en caso de error
      event.target.value = '';
    }
  }
  
  private validarArchivo(file: File): boolean {
    // Validar tamaño
    if (file.size > this.MAX_FILE_SIZE) {
      this.msg.add({
        severity: 'error',
        summary: 'Archivo muy grande',
        detail: 'Máximo 5MB permitido'
      });
      return false;
    }
    
    // Validar formato
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
  
  private convertirABase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Validar que el resultado sea válido
        if (result && result.startsWith('data:')) {
          resolve(result);
        } else {
          reject(new Error('El archivo no se pudo convertir correctamente'));
        }
      };
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      reader.readAsDataURL(file);
    });
  }
  
  // ── GUARDADO ─────────────────────────────────────────────────────────
  
  async guardarEmpresa() {
  console.log('🔍 Validando formulario...');

  // Marcar todos los campos para mostrar errores visualmente
  this.empresaForm.markAllAsTouched();

  // Validar solo los campos principales (sin contar el FormArray en la validación raíz)
  const camposPrincipales = ['nombre_comercial', 'ruc', 'color', 'prefijo'];
  const hayErrorEnPrincipales = camposPrincipales.some(campo => {
    const ctrl = this.empresaForm.get(campo);
    return ctrl?.invalid && ctrl?.errors;
  });

  console.log('📋 Formulario válido:', this.empresaForm.valid);
  console.log('📋 Formulario completo:', this.empresaForm.value);

  if (hayErrorEnPrincipales) {
    console.log('❌ Formulario inválido - errores en campos principales');
    this.msg.add({
      severity: 'warn',
      summary: 'Formulario inválido',
      detail: 'Por favor completa todos los campos requeridos'
    });
    return;
  }

  // Validar que las cuentas que existan sean válidas
  if (this.cuentasFormArray.length > 0 && this.cuentasFormArray.invalid) {
    console.log('❌ Hay cuentas bancarias con datos incompletos');
    this.msg.add({
      severity: 'warn',
      summary: 'Cuentas incompletas',
      detail: 'Completa o elimina las cuentas bancarias con datos faltantes'
    });
    return;
  }

  this.enviando = true;

  try {
    // Obtener el valor del ID considerando si está deshabilitado
    const idControl = this.empresaForm.get('id');
    const idValue = idControl?.disabled ? idControl?.value : this.empresaForm.value.id;

    console.log('📝 ID final a usar:', idValue);

    const formData = {
      ...this.empresaForm.value,
      id: idValue
    };

    console.log('📝 Datos a guardar:', formData);
    console.log('📝 Es edición:', this.esEdicion);

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

    await this.supabase.guardarEmpresa(formData);

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
    await this.cargarEmpresas();

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
  
  private guardarBorrador() {
    try {
      const formData = this.empresaForm.value;
      localStorage.setItem('empresa_borrador', JSON.stringify({
        ...formData,
        fechaGuardado: new Date().toISOString()
      }));
    } catch (error) {
      console.warn('No se pudo guardar el borrador:', error);
    }
  }
  
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

  /** Genera un prefijo automático basado en la razón social */
  generarPrefijo(razonSocial: string): string {
    if (!razonSocial) return '';
    // Limpiar caracteres especiales y tomar iniciales significativas
    const palabras = razonSocial
      .replace(/[^A-Za-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(p => p.length > 1 && !['SAC','SRL','EIRL','SA','SAA','SAS','DE','DEL','LA','EL','LOS','LAS','Y'].includes(p.toUpperCase()));

    let prefijo = '';
    if (palabras.length >= 2) {
      // Tomar primera letra de las 2-3 primeras palabras significativas
      prefijo = palabras.slice(0, 3).map(p => p[0]).join('').toUpperCase();
    } else if (palabras.length === 1) {
      // Tomar primeras 2-3 letras de la única palabra
      prefijo = palabras[0].substring(0, 3).toUpperCase();
    }

    return prefijo || razonSocial.substring(0, 2).toUpperCase();
  }

  /** Fuerza mayúsculas en el campo de prefijo/id */
  forzarMayusculas(controlName: string) {
    const control = this.empresaForm.get(controlName);
    if (control?.value) {
      control.setValue(control.value.toUpperCase(), { emitEvent: false });
    }
  }
}

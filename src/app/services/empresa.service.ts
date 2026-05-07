import { Injectable } from '@angular/core';
import { Observable, Subject, of, timer, throwError, BehaviorSubject, from } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap, map, catchError, tap } from 'rxjs/operators';
import { SupabaseService } from './supabase.service';
import { EmpresaTable } from '../models/database-schema';
import { EmpresaFormData, EmpresaValidationError, EmpresaFormState, IEmpresa } from '../models/empresa.model';
import { EmpresaValidators } from '../validators/empresa.validators';

@Injectable({
  providedIn: 'root'
})
export class EmpresaService {
  private readonly STORAGE_KEY = 'empresa_draft';
  private readonly AUTOSAVE_DELAY = 3000; // 3 segundos
  
  private empresasSubject = new BehaviorSubject<IEmpresa[]>([]);
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private erroresSubject = new BehaviorSubject<EmpresaValidationError[]>([]);
  
  empresas$ = this.empresasSubject.asObservable();
  loading$ = this.loadingSubject.asObservable();
  errores$ = this.erroresSubject.asObservable();
  
  constructor(
    public supabase: SupabaseService  // Hacer público para acceso desde validadores
  ) {}
  
  // ── CARGA DE DATOS ────────────────────────────────────────
  
  cargarEmpresas(): Observable<IEmpresa[]> {
    this.loadingSubject.next(true);
    this.limpiarErrores();
    
    return from(this.cargarEmpresasConCuentas()).pipe(
      tap(empresas => {
        this.empresasSubject.next(empresas);
        this.loadingSubject.next(false);
      }),
      catchError(error => {
        this.loadingSubject.next(false);
        this.agregarError({
          campo: 'general',
          mensaje: 'Error al cargar las empresas: ' + error.message,
          severidad: 'error'
        });
        return throwError(() => error);
      })
    );
  }

  private async cargarEmpresasConCuentas(): Promise<IEmpresa[]> {
    const empresas = await this.supabase.getEmpresas();
    const normalizadas = this.normalizarEmpresas(empresas as any[]);

    const conCuentas = await Promise.all(
      normalizadas.map(async (empresa) => {
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
        return empresa;
      })
    );

    return conCuentas;
  }
  
  private normalizarEmpresas(empresas: any[]): IEmpresa[] {
    return empresas.map(empresa => ({
      ...empresa,
      cuentas_bancarias: Array.isArray(empresa.cuentas_bancarias) ? empresa.cuentas_bancarias : [],
      mostrar_cuentas: empresa.mostrar_cuentas ?? true,
      activa: empresa.activa ?? true,
      color: empresa.color || '#01696f'
    }));
  }
  
  // ── GUARDADO ───────────────────────────────────────────────
  
  guardarEmpresa(formData: EmpresaFormData, esEdicion: boolean): Observable<IEmpresa> {
    this.limpiarErrores();
    
    // Validar datos antes de enviar
    const erroresValidacion = this.validarDatosEmpresa(formData);
    if (erroresValidacion.length > 0) {
      erroresValidacion.forEach(error => this.agregarError(error));
      return throwError(() => new Error('Hay errores de validación'));
    }
    
    const empresaParaGuardar = this.prepararDatosParaGuardar(formData);
    
    return from(this.supabase.guardarEmpresa(empresaParaGuardar as IEmpresa)).pipe(
      switchMap(async () => {
        await this.supabase.sincronizarCuentasBancarias(
          empresaParaGuardar.id!,
          empresaParaGuardar.cuentas_bancarias || []
        );
        return this.cargarEmpresas().toPromise();
      }),
      switchMap(() => this.cargarEmpresas()),
      map(() => empresaParaGuardar as IEmpresa),
      catchError(error => {
        this.agregarError({
          campo: 'general',
          mensaje: 'Error al guardar la empresa: ' + error.message,
          severidad: 'error'
        });
        return throwError(() => error);
      })
    );
  }
  
  private validarDatosEmpresa(formData: EmpresaFormData): EmpresaValidationError[] {
    const errores: EmpresaValidationError[] = [];
    
    // Validaciones básicas
    if (!formData.id?.trim()) {
      errores.push({ campo: 'id', mensaje: 'El ID es obligatorio', severidad: 'error' });
    } else if (!EmpresaValidators.idEmpresa()(null as any)) {
      errores.push({ campo: 'id', mensaje: 'El formato del ID no es válido', severidad: 'error' });
    }
    
    if (!formData.nombre_comercial?.trim()) {
      errores.push({ campo: 'nombre_comercial', mensaje: 'El nombre comercial es obligatorio', severidad: 'error' });
    }
    
    if (formData.ruc && EmpresaValidators.rucPeruano()(null as any)) {
      errores.push({ campo: 'ruc', mensaje: 'El RUC no es válido', severidad: 'error' });
    }
    
    if (formData.correo && EmpresaValidators.email()(null as any)) {
      errores.push({ campo: 'correo', mensaje: 'El email no es válido', severidad: 'error' });
    }
    
    if (formData.ruta_logo && EmpresaValidators.url()(null as any)) {
      errores.push({ campo: 'ruta_logo', mensaje: 'La URL del logo no es válida', severidad: 'error' });
    }
    
    if (formData.ruta_firma && EmpresaValidators.url()(null as any)) {
      errores.push({ campo: 'ruta_firma', mensaje: 'La URL de la firma no es válida', severidad: 'error' });
    }
    
    if (formData.prefijo && EmpresaValidators.prefijoCotizacion()(null as any)) {
      errores.push({ campo: 'prefijo', mensaje: 'El prefijo no es válido', severidad: 'error' });
    }
    
    // Validaciones de cuentas bancarias
    if (formData.mostrar_cuentas && (!formData.cuentas_bancarias || formData.cuentas_bancarias.length === 0)) {
      errores.push({ 
        campo: 'cuentas_bancarias', 
        mensaje: 'Debe agregar al menos una cuenta bancaria si las cuentas están visibles', 
        severidad: 'warning' 
      });
    }
    
    formData.cuentas_bancarias?.forEach((cuenta, index) => {
      if (!cuenta.banco?.trim()) {
        errores.push({ 
          campo: `cuenta_${index}_banco`, 
          mensaje: 'El banco es obligatorio', 
          severidad: 'error' 
        });
      }
      
      if (!cuenta.numero?.trim()) {
        errores.push({ 
          campo: `cuenta_${index}_numero`, 
          mensaje: 'El número de cuenta es obligatorio', 
          severidad: 'error' 
        });
      } else if (EmpresaValidators.numeroCuentaBancaria()(null as any)) {
        errores.push({ 
          campo: `cuenta_${index}_numero`, 
          mensaje: 'El número de cuenta no es válido', 
          severidad: 'error' 
        });
      }
      
      if (cuenta.cci && EmpresaValidators.cci()(null as any)) {
        errores.push({ 
          campo: `cuenta_${index}_cci`, 
          mensaje: 'El CCI no es válido', 
          severidad: 'warning' 
        });
      }
    });
    
    return errores;
  }
  
  private prepararDatosParaGuardar(formData: EmpresaFormData): Partial<IEmpresa> {
    return {
      id: formData.id.trim().toUpperCase(),
      nombre_comercial: formData.nombre_comercial.trim(),
      razon_social: formData.razon_social?.trim() || '',
      ruc: formData.ruc?.trim() || '',
      color: formData.color,
      direccion: formData.direccion?.trim() || '',
      telefonos: formData.telefonos?.trim() || '',
      correo: formData.correo?.trim() || '',
      ruta_logo: formData.ruta_logo?.trim() || '',
      ruta_firma: formData.ruta_firma?.trim() || '',
      activa: formData.activa,
      cuentas_bancarias: formData.cuentas_bancarias.filter(c => 
        c.banco?.trim() && c.numero?.trim()
      ),
      contacto_aprobacion: formData.contacto_aprobacion?.trim() || '',
      mostrar_cuentas: formData.mostrar_cuentas,
      prefijo: formData.prefijo?.trim().toUpperCase() || '',
      fecha_actualizacion: new Date().toISOString()
    };
  }
  
  // ── ELIMINACIÓN ─────────────────────────────────────────────
  
  eliminarEmpresa(id: string): Observable<void> {
    this.limpiarErrores();
    
    return from(this.supabase.eliminarEmpresa(id)).pipe(
      tap(() => {
        // Recargar la lista después de eliminar
        this.cargarEmpresas().subscribe();
      }),
      map(() => void 0),
      catchError(error => {
        this.agregarError({
          campo: 'general',
          mensaje: 'Error al eliminar la empresa: ' + error.message,
          severidad: 'error'
        });
        return throwError(() => error);
      })
    );
  }
  
  // ── AUTOSAVE ───────────────────────────────────────────────
  
  guardarBorrador(formData: Partial<EmpresaFormData>): void {
    try {
      const borrador = {
        ...formData,
        fechaGuardado: new Date().toISOString()
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(borrador));
    } catch (error) {
      console.warn('No se pudo guardar el borrador:', error);
    }
  }
  
  recuperarBorrador(): Partial<EmpresaFormData> | null {
    try {
      const guardado = localStorage.getItem(this.STORAGE_KEY);
      if (guardado) {
        const borrador = JSON.parse(guardado);
        // Eliminar datos temporales
        delete borrador.fechaGuardado;
        return borrador;
      }
    } catch (error) {
      console.warn('No se pudo recuperar el borrador:', error);
    }
    return null;
  }
  
  limpiarBorrador(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }
  
  // ── UTILIDADES ───────────────────────────────────────────────
  
  crearEmpresaVacia(): EmpresaFormData {
    return {
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
      activa: true,
      cuentas_bancarias: [],
      contacto_aprobacion: '',
      mostrar_cuentas: true,
      prefijo: ''
    };
  }
  
  clonarEmpresa(empresa: IEmpresa): EmpresaFormData {
    return {
      id: empresa.id,
      nombre_comercial: empresa.nombre_comercial,
      razon_social: empresa.razon_social || '',
      ruc: empresa.ruc,
      color: empresa.color,
      direccion: empresa.direccion || '',
      telefonos: empresa.telefonos || '',
      correo: empresa.correo || '',
      ruta_logo: empresa.ruta_logo || '',
      ruta_firma: empresa.ruta_firma || '',
      activa: empresa.activa,
      cuentas_bancarias: structuredClone(empresa.cuentas_bancarias || []),
      contacto_aprobacion: empresa.contacto_aprobacion || '',
      mostrar_cuentas: empresa.mostrar_cuentas,
      prefijo: empresa.prefijo || ''
    };
  }
  
  // ── GESTIÓN DE ERRORES ───────────────────────────────────────
  
  private agregarError(error: EmpresaValidationError): void {
    const erroresActuales = this.erroresSubject.value;
    this.erroresSubject.next([...erroresActuales, error]);
  }
  
  private limpiarErrores(): void {
    this.erroresSubject.next([]);
  }
  
  limpiarError(campo: string): void {
    const erroresActuales = this.erroresSubject.value;
    const erroresFiltrados = erroresActuales.filter(error => error.campo !== campo);
    this.erroresSubject.next(erroresFiltrados);
  }
  
  // ── EXPORTACIÓN/IMPORTACIÓN ───────────────────────────────────
  
  exportarEmpresas(): Observable<string> {
    return this.empresas$.pipe(
      map(empresas => {
        const datosExportacion = {
          version: '1.0',
          fecha: new Date().toISOString(),
          empresas: empresas
        };
        return JSON.stringify(datosExportacion, null, 2);
      }),
      catchError((error: any) => {
        this.agregarError({
          campo: 'general',
          mensaje: 'Error al exportar empresas: ' + error.message,
          severidad: 'error'
        });
        return throwError(() => error);
      })
    );
  }
  
  importarEmpresas(jsonData: string): Observable<number> {
    try {
      const datos = JSON.parse(jsonData);
      const empresas = datos.empresas || [];
      
      if (!Array.isArray(empresas)) {
        return throwError(() => new Error('El formato de importación no es válido'));
      }
      
      // Validar y procesar cada empresa
      const empresasValidas = empresas.filter((emp: any) => 
        emp.id && emp.nombre_comercial
      );
      
      if (empresasValidas.length === 0) {
        return throwError(() => new Error('No hay empresas válidas para importar'));
      }
      
      // Aquí se implementaría la lógica de importación masiva
      // Por ahora retornamos el número de empresas válidas
      return of(empresasValidas.length);
      
    } catch (error: any) {
      return throwError(() => new Error('El archivo no tiene un formato JSON válido'));
    }
  }
}

import { Injectable } from '@angular/core';
import { AbstractControl, ValidatorFn, AsyncValidatorFn, ValidationErrors } from '@angular/forms';
import { Observable, of, timer } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { SupabaseService } from '../services/supabase.service';

export class EmpresaValidators {

  // ── VALIDACIONES SÍNCRONAS ──────────────────────────────────────

  static rucPeruano(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      
      const ruc = control.value.toString().trim();
      
      // RUC debe tener 11 dígitos
      if (!/^[0-9]{11}$/.test(ruc)) {
        return { rucInvalido: 'El RUC debe tener exactamente 11 dígitos numéricos' };
      }
      
      // Validación básica del algoritmo del RUC peruano
      const digitos = ruc.split('').map(Number);
      const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
      const suma = digitos.slice(0, 10).reduce((acc: number, digito: number, index: number) => acc + digito * factores[index], 0);
      const resto = suma % 11;
      const digitoVerificador = resto === 0 ? 0 : 11 - resto;
      
      if (digitoVerificador !== digitos[10]) {
        return { rucInvalido: 'El RUC no es válido según el algoritmo de validación' };
      }
      
      return null;
    };
  }

  static email(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      
      const email = control.value.toString().trim();
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      
      if (!emailRegex.test(email)) {
        return { emailInvalido: 'El formato del email no es válido' };
      }
      
      return null;
    };
  }

  static url(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      
      const url = control.value.toString().trim();
      
      try {
        new URL(url);
        // Verificar que sea http o https
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          return { urlInvalida: 'La URL debe comenzar con http:// o https://' };
        }
        return null;
      } catch {
        return { urlInvalida: 'La URL no tiene un formato válido' };
      }
    };
  }

  static prefijoCotizacion(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      
      const prefijo = control.value.toString().trim().toUpperCase();
      
      if (!/^[A-Z0-9]{1,5}$/.test(prefijo)) {
        return { 
          prefijoInvalido: 'El prefijo debe tener 1-5 caracteres alfanuméricos (solo letras mayúsculas y números)' 
        };
      }
      
      return null;
    };
  }

  static telefonoPeruano(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      
      const telefono = control.value.toString().trim();
      
      // Formatos peruanos: 9 dígitos (celular) o 7 dígitos (fijo) con posible prefijo
      const telefonoRegex = /^(?:\+51\s?)?(?:[1-9]\d{1,2}\s?)?\d{7,9}$/;
      
      if (!telefonoRegex.test(telefono.replace(/\s/g, ''))) {
        return { telefonoInvalido: 'El formato del teléfono no es válido para Perú' };
      }
      
      return null;
    };
  }

  static idEmpresa(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      
      const id = control.value.toString().trim().toUpperCase();
      
      if (!/^[A-Z0-9]{2,10}$/.test(id)) {
        return { 
          idInvalido: 'El ID debe tener 2-10 caracteres alfanuméricos (solo letras mayúsculas y números)' 
        };
      }
      
      return null;
    };
  }

  static numeroCuentaBancaria(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      
      const numero = control.value.toString().trim();
      
      // Formato común de cuentas bancarias peruanas
      if (!/^[0-9\-]{6,20}$/.test(numero)) {
        return { 
          cuentaInvalida: 'El número de cuenta debe tener 6-20 dígitos, puede incluir guiones' 
        };
      }
      
      return null;
    };
  }

  static cci(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      if (!control.value) return null;
      
      const cci = control.value.toString().trim();
      
      // CCI通常 tiene 20-21 dígitos
      if (!/^[0-9]{20,21}$/.test(cci)) {
        return { 
          cciInvalido: 'El CCI debe tener 20-21 dígitos numéricos' 
        };
      }
      
      return null;
    };
  }

  // ── VALIDACIONES ASÍNCRONAS ─────────────────────────────────────

  static idUnico(supabaseService: SupabaseService, idOriginal?: string): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      if (!control.value) return of(null);
      
      const id = control.value.toString().trim().toUpperCase();
      
      // Si estamos editando y el ID no cambió, es válido
      if (idOriginal && id === idOriginal.toUpperCase()) {
        return of(null);
      }
      
      // Validación básica de formato primero
      if (!/^[A-Z0-9]{2,10}$/.test(id)) {
        return of({ idInvalido: 'El ID debe tener 2-10 caracteres alfanuméricos (solo mayúsculas)' });
      }
      
      // Debounce de 500ms para evitar demasiadas peticiones
      return timer(500).pipe(
        switchMap(async () => {
          try {
            const existe = await supabaseService.verificarIdExistente(id);
            return existe ? { idDuplicado: '¡Este ID ya existe! Por favor elige otro ID para continuar' } : null;
          } catch {
            return null; // Si hay error, no bloqueamos
          }
        }),
        catchError(() => of(null))
      );
    };
  }

  static prefijoUnico(supabaseService: SupabaseService, prefijoOriginal?: string): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      if (!control.value) return of(null);
      
      const prefijo = control.value.toString().trim().toUpperCase();
      
      // Si estamos editando y el prefijo no cambió, es válido
      if (prefijoOriginal && prefijo === prefijoOriginal.toUpperCase()) {
        return of(null);
      }
      
      if (!/^[A-Z0-9]{1,5}$/.test(prefijo)) {
        return of(null); // Dejar que el validador de pattern se encargue
      }
      
      return timer(500).pipe(
        switchMap(async () => {
          try {
            const existe = await supabaseService.verificarPrefijoExistente(prefijo);
            return existe ? { prefijoDuplicado: 'Este prefijo ya está en uso por otra empresa' } : null;
          } catch {
            return null;
          }
        }),
        catchError(() => of(null))
      );
    };
  }

  static rucUnico(supabaseService: SupabaseService, rucOriginal?: string): AsyncValidatorFn {
    return (control: AbstractControl): Observable<ValidationErrors | null> => {
      if (!control.value) return of(null);
      
      const ruc = control.value.toString().trim();
      
      // Si estamos editando y el RUC no cambió, es válido
      if (rucOriginal && ruc === rucOriginal) {
        return of(null);
      }
      
      // Validación básica de formato primero
      if (!/^[0-9]{11}$/.test(ruc)) {
        return of({ rucInvalido: 'El RUC debe tener exactamente 11 dígitos numéricos' });
      }
      
      // Debounce de 500ms
      return timer(500).pipe(
        switchMap(async () => {
          try {
            const existe = await supabaseService.verificarRucExistente(ruc);
            return existe ? { rucDuplicado: 'El RUC ya está registrado' } : null;
          } catch {
            return null; // Si hay error, no bloqueamos
          }
        }),
        catchError(() => of(null))
      );
    };
  }

  // ── VALIDACIONES CRUZADAS ───────────────────────────────────────

  static cuentasBancariasValidas(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const cuentas = control.value;
      
      if (!Array.isArray(cuentas)) return null;
      
      // Verificar que al menos una cuenta esté completa si mostrar_cuentas está activado
      const cuentasIncompletas = cuentas.filter(cuenta => 
        !cuenta.banco?.trim() || !cuenta.numero?.trim()
      );
      
      if (cuentasIncompletas.length > 0) {
        return { 
          cuentasIncompletas: 'Hay cuentas bancarias incompletas. Deben tener banco y número como mínimo' 
        };
      }
      
      // Verificar duplicados
      const duplicados = cuentas.filter((cuenta, index) => 
        cuentas.findIndex(c => c.banco === cuenta.banco && c.numero === cuenta.numero) !== index
      );
      
      if (duplicados.length > 0) {
        return { cuentasDuplicadas: 'Hay cuentas bancarias duplicadas' };
      }
      
      return null;
    };
  }
}

// ── MENSAJES DE ERROR ───────────────────────────────────────────

export const MENSAJES_ERROR = {
  required: 'Este campo es obligatorio',
  rucInvalido: 'El RUC no es válido',
  emailInvalido: 'El email no tiene un formato válido',
  urlInvalida: 'La URL no es válida',
  prefijoInvalido: 'El prefijo no es válido',
  telefonoInvalido: 'El teléfono no tiene un formato válido',
  idInvalido: 'El ID no es válido',
  cuentaInvalida: 'El número de cuenta no es válido',
  cciInvalido: 'El CCI no es válido',
  idDuplicado: 'El ID ya está en uso',
  rucDuplicado: 'El RUC ya está registrado',
  cuentasIncompletas: 'Hay cuentas bancarias incompletas',
  cuentasDuplicadas: 'Hay cuentas bancarias duplicadas'
};

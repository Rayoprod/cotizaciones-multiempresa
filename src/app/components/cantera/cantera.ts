import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { AlmacenCampoService } from '../../services/almacen-campo';
import { SessionContextService } from '../../services/session-context.service';

interface IAnotacionDePrueba {
  id: string;
  fecha: string;
}

/**
 * Prueba de lo más riesgoso de la Fase 3, antes de construir las salidas: que la
 * app abra y guarde sin señal en el Android del encargado.
 */
@Component({
  selector: 'app-cantera',
  standalone: true,
  imports: [CommonModule, ButtonModule],
  templateUrl: './cantera.html',
  styleUrl: './cantera.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CanteraComponent implements OnInit {
  conSenal = navigator.onLine;
  /** null mientras no se sabe, o en un navegador que no lo permite. */
  datosProtegidos: boolean | null = null;
  anotaciones: IAnotacionDePrueba[] = [];
  errorAlmacen = false;

  constructor(
    private almacen: AlmacenCampoService,
    readonly session: SessionContextService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit() {
    this.session.activarModoCampo();
    this.protegerDatos();
    await this.cargar();
  }

  @HostListener('window:online')
  @HostListener('window:offline')
  alCambiarConexion() {
    this.conSenal = navigator.onLine;
    this.cdr.markForCheck();
  }

  /** Sin esto, Android puede borrar lo guardado si le falta espacio. */
  private async protegerDatos() {
    try {
      this.datosProtegidos = await navigator.storage.persist();
    } catch {
      this.datosProtegidos = null;
    }
    this.cdr.markForCheck();
  }

  private async cargar() {
    try {
      const filas = await this.almacen.listar<IAnotacionDePrueba>('pruebas');
      this.anotaciones = filas.sort((a, b) => b.fecha.localeCompare(a.fecha));
      this.errorAlmacen = false;
    } catch (e) {
      console.error('No se pudo leer lo guardado en el celular:', e);
      this.errorAlmacen = true;
    }
    this.cdr.markForCheck();
  }

  async anotar() {
    try {
      await this.almacen.guardar<IAnotacionDePrueba>('pruebas', { id: crypto.randomUUID(), fecha: new Date().toISOString() });
      await this.cargar();
    } catch (e) {
      console.error('No se pudo guardar en el celular:', e);
      this.errorAlmacen = true;
      this.cdr.markForCheck();
    }
  }

  fechaHora(fecha: string): string {
    return new Date(fecha).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  salir() {
    this.session.salirModoCampo();
    this.router.navigate(['/']);
  }
}

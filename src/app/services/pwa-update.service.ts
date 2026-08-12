import { Injectable, Optional, signal, ApplicationRef } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter, first } from 'rxjs/operators';
import { interval, concat } from 'rxjs';
import { MessageService } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  readonly updateAvailable = signal<boolean>(false);
  readonly canInstallPwa = signal<boolean>(false);
  readonly isCheckingForUpdate = signal<boolean>(false);
  private deferredPrompt: any = null;

  constructor(
    private appRef: ApplicationRef,
    @Optional() private swUpdate?: SwUpdate,
    @Optional() private messageService?: MessageService
  ) {
    this.initUpdateListener();
    this.initInstallPromptListener();
    this.initPeriodicCheck();
    this.initVisibilityCheck();
    this.initUnrecoverableListener();
  }

  private initUpdateListener(): void {
    if (!this.swUpdate?.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(async () => {
        this.updateAvailable.set(true);
        try {
          await this.swUpdate?.activateUpdate();
          if (typeof window !== 'undefined') {
            window.location.reload();
          }
        } catch (err) {
          console.error('⚠️ Error al auto-activar actualización PWA:', err);
        }
      });
  }

  private initPeriodicCheck(): void {
    if (!this.swUpdate?.isEnabled) return;

    // Esperar a que la aplicación esté estable antes de iniciar chequeos periódicos cada 5 minutos
    const appIsStable$ = this.appRef.isStable.pipe(filter(isStable => isStable === true), first());
    const everyFiveMinutes$ = interval(5 * 60 * 1000);
    const checkInterval$ = concat(appIsStable$, everyFiveMinutes$);

    checkInterval$.subscribe(async () => {
      try {
        await this.checkForUpdateInternal();
      } catch (err) {
        console.warn('⚠️ Error al buscar actualización periódica PWA:', err);
      }
    });
  }

  private initVisibilityCheck(): void {
    if (typeof window === 'undefined' || !this.swUpdate?.isEnabled) return;

    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState === 'visible') {
        await this.checkForUpdateInternal();
      }
    });
  }

  private initUnrecoverableListener(): void {
    if (!this.swUpdate?.isEnabled) return;

    this.swUpdate.unrecoverable.subscribe(event => {
      console.error('❌ Estado de caché PWA no recuperable:', event.reason);
      if (typeof window !== 'undefined') {
        window.location.reload();
      }
    });
  }

  private initInstallPromptListener(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('beforeinstallprompt', (e: Event) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.canInstallPwa.set(true);
    });

    window.addEventListener('appinstalled', () => {
      this.canInstallPwa.set(false);
      this.deferredPrompt = null;
      this.messageService?.add({
        severity: 'success',
        summary: '🎉 Aplicación Instalada',
        detail: 'El Sistema de Cotizaciones ahora está instalado en tu dispositivo.',
        life: 4000
      });
    });
  }

  async checkForUpdateManually(): Promise<boolean> {
    if (!this.swUpdate?.isEnabled) {
      this.messageService?.add({
        severity: 'warn',
        summary: 'Modo Desarrollo',
        detail: 'El Service Worker solo está activo en entornos de producción.',
        life: 3000
      });
      return false;
    }

    this.isCheckingForUpdate.set(true);
    try {
      const hasUpdate = await this.swUpdate.checkForUpdate();
      if (!hasUpdate && !this.updateAvailable()) {
        this.messageService?.add({
          severity: 'success',
          summary: 'Sistema Actualizado',
          detail: 'Estás utilizando la versión más reciente del sistema.',
          life: 3000
        });
      }
      return hasUpdate;
    } catch (err: any) {
      console.error('Error al comprobar actualización manual:', err);
      return false;
    } finally {
      this.isCheckingForUpdate.set(false);
    }
  }

  private async checkForUpdateInternal(): Promise<boolean> {
    if (!this.swUpdate?.isEnabled || this.updateAvailable()) return false;
    try {
      return await this.swUpdate.checkForUpdate();
    } catch {
      return false;
    }
  }

  async promptInstallPwa(): Promise<boolean> {
    if (!this.deferredPrompt) return false;
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    this.canInstallPwa.set(false);
    return outcome === 'accepted';
  }

  reloadApp(): void {
    if (this.swUpdate?.isEnabled) {
      this.swUpdate.activateUpdate().then(() => {
        window.location.reload();
      });
    } else {
      window.location.reload();
    }
  }
}

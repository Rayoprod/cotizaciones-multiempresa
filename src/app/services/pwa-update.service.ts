import { Injectable, Optional, signal } from '@angular/core';
import { SwUpdate, VersionReadyEvent } from '@angular/service-worker';
import { filter } from 'rxjs/operators';
import { MessageService } from 'primeng/api';

@Injectable({ providedIn: 'root' })
export class PwaUpdateService {
  readonly updateAvailable = signal<boolean>(false);
  readonly canInstallPwa = signal<boolean>(false);
  private deferredPrompt: any = null;

  constructor(
    @Optional() private swUpdate?: SwUpdate,
    @Optional() private messageService?: MessageService
  ) {
    this.initUpdateListener();
    this.initInstallPromptListener();
  }

  private initUpdateListener(): void {
    if (!this.swUpdate?.isEnabled) return;

    this.swUpdate.versionUpdates
      .pipe(filter((evt): evt is VersionReadyEvent => evt.type === 'VERSION_READY'))
      .subscribe(() => {
        this.updateAvailable.set(true);
        this.messageService?.add({
          severity: 'info',
          summary: '🚀 Actualización disponible',
          detail: 'Una nueva versión del Cotizador está lista. Haz clic aquí para actualizar.',
          sticky: true,
          key: 'pwa-update-toast'
        });
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

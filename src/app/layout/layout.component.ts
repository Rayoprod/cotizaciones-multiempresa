import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';

import { PanelMenuModule } from 'primeng/panelmenu';
import { ButtonModule } from 'primeng/button';
import { MenuItem } from 'primeng/api';

@Component({
  selector: 'app-layout',
  standalone: true,
  imports: [CommonModule, RouterModule, PanelMenuModule, ButtonModule],
  templateUrl: './layout.component.html',
  styleUrls: ['./layout.component.scss'] // ¡Recuerda que este archivo SCSS ahora está vacío!
})
export class LayoutComponent implements OnInit {
  itemsMenu: MenuItem[] = [];
  menuAbierto: boolean = false;

  constructor(private router: Router) {}

  ngOnInit() {
    this.itemsMenu = [
      {
        label: 'Ventas',
        icon: 'pi pi-shopping-cart',
        items: [
          { label: 'Nueva Cotización', icon: 'pi pi-plus', routerLink: '/cotizador', command: () => this.cerrarMenu() },
          { label: 'Historial', icon: 'pi pi-history', routerLink: '/historial', command: () => this.cerrarMenu() }
        ]
      },
      {
        label: 'Gestión',
        icon: 'pi pi-database',
        items: [
          { label: 'Productos', icon: 'pi pi-box', routerLink: '/productos', command: () => this.cerrarMenu() },
          { label: 'Clientes', icon: 'pi pi-users', routerLink: '/clientes', command: () => this.cerrarMenu() }
        ]
      }
    ];
  }

  toggleMenu() {
    this.menuAbierto = !this.menuAbierto;
  }

  cerrarMenu() {
    this.menuAbierto = false;
  }

  cerrarSesion() {
    localStorage.clear();
    this.router.navigate(['/login']);
  }
}
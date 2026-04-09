import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  standalone: true, // Asegúrate de que tenga esto
  imports: [RouterOutlet],
  template: '<router-outlet></router-outlet>' // Usamos template directo para descartar errores de app.html
})
export class App {}
import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class ApiPeruService {
  // Tu token centralizado y seguro en un solo lugar
  private token = 'sk_14670.Rl3QC2eRGOShBSsUP3HL63QbRl8PmOYd';
  private baseUrl = '/api-peru/v1';

  constructor() {}

  async buscarDocumento(documento: string) {
    const doc = documento.trim();
    if (doc.length !== 8 && doc.length !== 11) {
      throw new Error('El documento debe tener 8 (DNI) o 11 (RUC) dígitos.');
    }

    const tipo = doc.length === 8 ? 'reniec/dni' : 'sunat/ruc';
    const url = `${this.baseUrl}/${tipo}?numero=${doc}`;

    const respuesta = await fetch(url, {
      headers: { Authorization: `Bearer ${this.token}` }
    });

    if (!respuesta.ok) {
      throw new Error(`No se encontraron datos para el documento ${doc}`);
    }

    return await respuesta.json();
  }
}